# Maintainer Roles and Decision Rights

This document records the people or institutional roles responsible for `ICICLE-ai/geoharmonizer-ui` (Earth Data Hub).

| Responsibility | Named person or institutional role | Backup | Decision authority |
|---|---|---|---|
| Product roadmap | Hari Subramoni (subramoni.1@osu.edu) | ICICLE-ai maintainers | Prioritizes scope and roadmap changes |
| Repository administration | Brijesh Nanda (brundayogananda.1@osu.edu) | ICICLE-ai maintainers | Manages repository access and settings |
| Pull-request review | Brijesh Nanda (brundayogananda.1@osu.edu) | ICICLE-ai maintainers | Approves or requests changes to contributions |
| Release management | Brijesh Nanda (brundayogananda.1@osu.edu) | ICICLE-ai maintainers | Creates and approves tagged releases |
| Security response | Brijesh Nanda (brundayogananda.1@osu.edu) | ICICLE-ai maintainers | Receives and coordinates vulnerability reports |
| Documentation and onboarding | Brijesh Nanda (brundayogananda.1@osu.edu) | ICICLE-ai maintainers | Maintains user and contributor documentation |
| Deployment (Tapis Pods) | Brijesh Nanda (brundayogananda.1@osu.edu) | ICICLE-ai maintainers | Builds and publishes the container image and updates the pod |

## Related components

This repository contains only the browser interface. Issues that turn out to originate in the `geoharmonizer-collect` Tapis application, the availability service, or the assistant service should be transferred or refiled against the repository that owns them; maintainers will identify the owner when triaging.

## Decision process

Substantial changes should begin with a public issue or design discussion unless the issue involves a security vulnerability, restricted data, or another matter that should be handled privately. Maintainers will document accepted, deferred, and declined changes with the reason needed for future contributors to understand the decision.

## Maintenance boundary

Maintainers may decline contributions that cannot be reviewed, tested, documented, licensed, released, or maintained with available project resources.
