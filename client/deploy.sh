TARGET=ziginotes.com

pnpx vite build
rsync -avz --delete dist root@$TARGET:/root/server/public
