# AWS Elastic Beanstalk (Single Service, No Domain)

This is the highest-automation deployment path for this repo using AWS credits:

- one managed service: **Elastic Beanstalk**
- one public URL: `http://<cname>.<region>.elasticbeanstalk.com`
- no custom domain required

It deploys the app in **single-container mode** (frontend + API + worker + SurrealDB in one container) by temporarily using `Dockerfile.single` during deployment.

## Prerequisites

- AWS account with credits
- IAM user/profile with Beanstalk + EC2 + S3 permissions
- `aws` CLI configured (`aws configure`)
- `eb` CLI installed (`pipx install awsebcli`)

## Quick start

1) Copy env template and fill required values:

```bash
cp deploy/aws-eb/eb.env.example deploy/aws-eb/eb.env
```

2) Edit `deploy/aws-eb/eb.env` and set at least:

- `AWS_REGION`
- `APP_NAME`
- `ENV_NAME`
- `CNAME_PREFIX`
- `OPEN_NOTEBOOK_PASSWORD`
- at least one AI provider key (`OPENAI_API_KEY`, etc.)

3) Run first deploy:

```bash
bash deploy/aws-eb/deploy.sh
```

The script will:
- initialize EB config if needed
- create the environment if missing
- set environment variables
- deploy current repo source
- print the app URL

## Updates after first deploy

Re-run the same command:

```bash
bash deploy/aws-eb/deploy.sh
```

## Notes

- URL is HTTP by default (`elasticbeanstalk.com` hostname). HTTPS with ACM is easier once you add your own domain.
- This mode keeps data inside one EC2 instance. It is simple but not HA.
- For production durability, move SurrealDB to managed storage later.
- First deploy from source builds frontend and Python dependencies on the instance; use at least `t3.large` to reduce timeout risk.
- The deploy bundle also configures larger root disk (`128GB`) to avoid Docker build failures from running out of space.
