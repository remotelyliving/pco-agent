.PHONY: install dev build test lint db-push db-migrate seed docker-build docker-up docker-down clean

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

# Linting
lint:
	npm run lint
	npx tsc --noEmit

format:
	npx prettier --write "src/**/*.{ts,tsx,js,jsx}"

# Database
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

# Docker
docker-build:
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
