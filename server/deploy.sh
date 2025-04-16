TARGET=ziginotes.com

rsync -avz --delete httpPublic src package.json pnpm-lock.yaml root@$TARGET:/root/server/
ssh root@$TARGET "cd /root/server && /root/.local/share/pnpm/pnpm i"