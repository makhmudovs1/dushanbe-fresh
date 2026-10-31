ARG NODE_IMAGE=node:22.23.3-bookworm-slim@sha256:3ed98443660ff48413b5af19ecefce3b9d50845a901a43420d47cc63a9fddbe9
FROM ${NODE_IMAGE} AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable && corepack prepare pnpm@9.12.3 --activate
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
ARG API_URL=http://127.0.0.1:4000/api/v1
ARG NEXT_PUBLIC_GEOAPIFY_MAP_API_KEY=
ENV API_URL=${API_URL} NEXT_OUTPUT_STANDALONE=true NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_GEOAPIFY_MAP_API_KEY=${NEXT_PUBLIC_GEOAPIFY_MAP_API_KEY}
RUN pnpm db:generate && pnpm build
RUN mkdir -p /out && pnpm --filter @dushanbe-fresh/api list --prod --depth Infinity --json > /out/trusted-dependencies.json \
    && pnpm --filter @dushanbe-fresh/api deploy --prod /out/api \
    && pnpm --dir /out/api list --prod --depth Infinity --json > /out/runtime-dependencies.json
# pnpm 9 deploy resolves a separate tree. Reject any version outside the frozen build tree.
RUN node -e 'const fs=require("node:fs");function packages(rows){const out=new Set();function walk(node){for(const [name,item] of Object.entries({...node.dependencies,...node.optionalDependencies})){if(!name.startsWith("@dushanbe-fresh/"))out.add(name+"@"+item.version);walk(item)}}for(const row of rows)walk(row);return out}const trusted=packages(JSON.parse(fs.readFileSync("/out/trusted-dependencies.json")));for(const item of packages(JSON.parse(fs.readFileSync("/out/runtime-dependencies.json"))))if(!trusted.has(item))throw Error("Runtime dependency differs from frozen build: "+item);'
# pnpm deploy does not retain Prisma's generated sibling directory.
RUN node -e 'const fs=require("node:fs"),p=require("node:path");const client=require.resolve("@prisma/client/package.json",{paths:["/workspace/apps/api"]});const runtimeClient=require.resolve("@prisma/client/package.json",{paths:["/out/api"]});const generated=p.resolve(p.dirname(client),"../../.prisma/client");const target=p.resolve(p.dirname(runtimeClient),"../../.prisma/client");fs.rmSync(target,{recursive:true,force:true});fs.cpSync(generated,target,{recursive:true});'
RUN node ops/tarena/collect-prisma-tool.cjs

FROM ${NODE_IMAGE} AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/pnpm \
    /usr/local/bin/pnpx /usr/local/bin/yarn /usr/local/bin/yarnpkg
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
USER node

FROM base AS api
WORKDIR /app
COPY --from=build --chown=node:node /out/api/node_modules ./node_modules
COPY --from=build --chown=node:node /out/api/dist ./dist
COPY --from=build --chown=node:node /out/api/package.json ./package.json
RUN node -e 'const c=new(require("@prisma/client").PrismaClient)();c.$disconnect();require("sharp");require("@dushanbe-fresh/shared");'
CMD ["node", "dist/main.js"]

FROM base AS web
WORKDIR /app
COPY --from=build --chown=node:node /workspace/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /workspace/apps/web/public ./apps/web/public
ENV HOSTNAME=127.0.0.1 PORT=3000
CMD ["node", "apps/web/server.js"]

# Migration tools are a separate, one-shot artifact, never the runtime API.
FROM base AS migrator
WORKDIR /app
COPY --from=build --chown=node:node /out/migrator/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/apps/api/prisma ./prisma
ENTRYPOINT ["node", "node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", "prisma/schema.prisma"]
