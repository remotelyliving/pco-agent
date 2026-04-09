.PHONY: install dev build start test test-watch test-e2e test-coverage test-mutation lint format typecheck verify docker-build docker-up docker-down docker-logs clean db-push db-migrate db-studio seed db-reset db-deploy docker-db-push docker-db-migrate docker-db-deploy docker-seed

# Development
install:
	npm install

dev:
	npm run dev

build:
	npm run build

start:
	npm run start

# Testing
test:
	npm run test

test-watch:
	npm run test -- --watch

test-e2e:
	npx playwright test

test-coverage:
	npm run test -- --coverage

test-mutation:
	npx stryker run

# Code quality
lint:
	npm run lint
	npx tsc --noEmit

typecheck:
	npx tsc --noEmit

format:
	npx prettier --write "src/**/*.{ts,tsx,js,jsx}"

# Pre-build verification — catches errors before they reach Docker
verify: typecheck lint test
	@echo "✅ All checks passed"

# Database (local — requires DB reachable at DATABASE_URL in .env)
db-push:
	npx prisma db push

db-migrate:
	npx prisma migrate dev

db-studio:
	npx prisma studio

seed:
	npx prisma db seed

db-reset:
	npx prisma migrate reset

db-deploy:
	npx prisma migrate deploy

# Database (Docker — runs inside pco-agent container on homelab-net)
# Uses node path directly since npx may not resolve in production image
PRISMA_CMD = node ./node_modules/prisma/build/index.js

docker-db-push:
	docker compose exec pco-agent $(PRISMA_CMD) db push

docker-db-migrate:
	docker compose exec pco-agent $(PRISMA_CMD) migrate dev

docker-db-deploy:
	docker compose exec pco-agent $(PRISMA_CMD) migrate deploy

docker-seed:
	docker compose exec pco-agent npx tsx prisma/seed.ts

# Docker — runs verify first to catch type/lint/test errors locally
docker-build: verify
	docker compose build

docker-up:
	docker compose up -d

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f pco-agent

# Cleanup
clean:
	rm -rf .next node_modules
