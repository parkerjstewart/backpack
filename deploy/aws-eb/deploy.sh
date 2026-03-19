#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

ENV_FILE="deploy/aws-eb/eb.env"
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}. Create it from deploy/aws-eb/eb.env.example."
  exit 1
fi

set -a
source "${ENV_FILE}"
set +a

required_vars=(
  "AWS_REGION"
  "APP_NAME"
  "ENV_NAME"
  "CNAME_PREFIX"
  "OPEN_NOTEBOOK_PASSWORD"
  "SURREAL_URL"
  "SURREAL_USER"
  "SURREAL_PASSWORD"
  "SURREAL_NAMESPACE"
  "SURREAL_DATABASE"
)

for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    echo "Missing required variable in ${ENV_FILE}: ${var_name}"
    exit 1
  fi
done

provider_keys=(
  "OPENAI_API_KEY"
  "ANTHROPIC_API_KEY"
  "GOOGLE_API_KEY"
  "GROQ_API_KEY"
  "OPENROUTER_API_KEY"
  "MISTRAL_API_KEY"
  "DEEPSEEK_API_KEY"
  "XAI_API_KEY"
)

has_provider_key="false"
for key in "${provider_keys[@]}"; do
  if [[ -n "${!key:-}" ]]; then
    has_provider_key="true"
    break
  fi
done

if [[ "${has_provider_key}" != "true" ]]; then
  echo "Set at least one provider API key in ${ENV_FILE}."
  exit 1
fi

for cmd in aws eb; do
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "Missing required command: ${cmd}"
    exit 1
  fi
done

aws sts get-caller-identity >/dev/null

APP_URL="http://${CNAME_PREFIX}.${AWS_REGION}.elasticbeanstalk.com"
INSTANCE_TYPE="${INSTANCE_TYPE:-t3.large}"
ROOT_VOLUME_GB="${ROOT_VOLUME_GB:-128}"

wait_for_ready() {
  local max_attempts="${1:-90}"
  local sleep_seconds="${2:-10}"
  local attempt=1

  while (( attempt <= max_attempts )); do
    local status
    status="$(aws elasticbeanstalk describe-environments \
      --region "${AWS_REGION}" \
      --application-name "${APP_NAME}" \
      --environment-names "${ENV_NAME}" \
      --query 'Environments[0].Status' \
      --output text 2>/dev/null || true)"

    if [[ "${status}" == "Ready" ]]; then
      return 0
    fi

    if [[ "${status}" == "None" || "${status}" == "Terminated" || "${status}" == "Terminating" ]]; then
      echo "Environment status is '${status}'. Cannot continue deployment."
      return 1
    fi

    echo "Environment status '${status}'. Waiting ${sleep_seconds}s... (${attempt}/${max_attempts})"
    sleep "${sleep_seconds}"
    ((attempt++))
  done

  echo "Timed out waiting for environment to become Ready."
  return 1
}

DOCKERFILE_BAK="$(mktemp)"
cp "Dockerfile" "${DOCKERFILE_BAK}"
COMPOSE_BAK_DIR="$(mktemp -d)"
restore_files() {
  cp "${DOCKERFILE_BAK}" "Dockerfile"
  rm -f "${DOCKERFILE_BAK}"
  shopt -s nullglob
  for compose_bak in "${COMPOSE_BAK_DIR}"/*; do
    mv "${compose_bak}" "${ROOT_DIR}/$(basename "${compose_bak}")"
  done
  shopt -u nullglob
  rmdir "${COMPOSE_BAK_DIR}" 2>/dev/null || true
}
trap restore_files EXIT
cp "Dockerfile.single" "Dockerfile"

# Elastic Beanstalk Docker platform auto-detects docker-compose if compose files
# exist in the source bundle. Temporarily move them out so EB builds Dockerfile.
shopt -s nullglob
for compose_file in docker-compose*.yml; do
  mv "${compose_file}" "${COMPOSE_BAK_DIR}/"
done
shopt -u nullglob

if [[ ! -f ".elasticbeanstalk/config.yml" ]]; then
  eb init "${APP_NAME}" --platform docker --region "${AWS_REGION}"
fi

setenv_args=(
  "API_URL=${APP_URL}"
  "INTERNAL_API_URL=http://127.0.0.1:5055"
  "SURREAL_URL=${SURREAL_URL}"
  "SURREAL_USER=${SURREAL_USER}"
  "SURREAL_PASSWORD=${SURREAL_PASSWORD}"
  "SURREAL_NAMESPACE=${SURREAL_NAMESPACE}"
  "SURREAL_DATABASE=${SURREAL_DATABASE}"
  "OPEN_NOTEBOOK_PASSWORD=${OPEN_NOTEBOOK_PASSWORD}"
)

for key in "${provider_keys[@]}"; do
  if [[ -n "${!key:-}" ]]; then
    setenv_args+=("${key}=${!key}")
  fi
done

if ! eb status "${ENV_NAME}" >/dev/null 2>&1; then
  eb create "${ENV_NAME}" --platform docker --single --instance_type "${INSTANCE_TYPE}" --cname "${CNAME_PREFIX}" --timeout 45
  eb setenv -e "${ENV_NAME}" "${setenv_args[@]}"
else
  wait_for_ready

  aws elasticbeanstalk update-environment \
    --region "${AWS_REGION}" \
    --environment-name "${ENV_NAME}" \
    --option-settings \
      Namespace=aws:autoscaling:launchconfiguration,OptionName=InstanceType,Value="${INSTANCE_TYPE}" \
      Namespace=aws:autoscaling:launchconfiguration,OptionName=RootVolumeSize,Value="${ROOT_VOLUME_GB}" >/dev/null

  wait_for_ready

  # Deploy app bits first to avoid config updates running on a stale compose-mode version.
  eb deploy "${ENV_NAME}" --timeout 45 --staged
  wait_for_ready
  eb setenv -e "${ENV_NAME}" "${setenv_args[@]}"
fi

echo "Deployed: ${APP_URL}"
echo "Health: ${APP_URL}/health"
