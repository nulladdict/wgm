#!/usr/bin/env bash
sudo apt update && sudo apt install curl neovim unzip -y
curl --fail --location --progress-bar --output deno.zip https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip
unzip deno.zip
rm deno.zip
chmod +x deno
mv deno /usr/bin/deno
curl --fail --location --progress-bar --output wgm.ts https://raw.githubusercontent.com/nulladdict/wgm/main/wgm.ts
