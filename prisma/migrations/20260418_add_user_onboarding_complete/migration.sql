-- Add onboardingComplete field to User model
ALTER TABLE "agent"."users" ADD COLUMN "onboarding_complete" BOOLEAN NOT NULL DEFAULT false;
