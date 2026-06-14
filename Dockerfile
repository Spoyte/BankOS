# BankOS backend image — ONE image for both Node services (CRE policy + Unlink engine),
# selected at build time via the SERVICE build-arg. Deployed to Fly.io (see fly.*.toml).
#
# The services run TypeScript directly through tsx (a runtime dependency), so there is no
# compile step: install the workspace, then `npm run -w @bankos/<service> start`.
FROM node:20-slim

# All workspace deps are pure JS (no native addons), so no build toolchain is needed.
WORKDIR /app

# Install against the committed lockfile. tsx is a runtime dep, so --omit=dev keeps it
# while dropping typescript/@types. `contracts` is not an npm workspace, so it is skipped.
COPY . .
RUN npm ci --omit=dev

# Which service this image runs: "cre-policy" or "unlink-engine".
ARG SERVICE
ENV SERVICE=$SERVICE \
    NODE_ENV=production

# PORT / CHAIN_ID / RPC_URL are supplied by fly.toml [env]; the Arc signer key is a Fly secret.
EXPOSE 8080
CMD ["sh", "-c", "npm run -w @bankos/$SERVICE start"]
