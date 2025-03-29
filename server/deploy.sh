TARGET=autonotes.turbobuilt.com

# rsync src package.json pnpm-lock.yaml deploy.sh $TARGET:/home/ubuntu/autonotes/server
rsync -avz  --delete httpPublic src package.json pnpm-lock.yaml root@$TARGET:/root/server/
ssh root@$TARGET "cd /root/server && /root/.local/share/pnpm/pnpm i"