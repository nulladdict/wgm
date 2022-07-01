# wgm

Personal [wireguard](https://www.wireguard.com/) setup script

## Usage

Ubuntu 20.04 LTS only

```bash
curl https://raw.githubusercontent.com/nulladdict/wgm/main/setup.sh | bash
# Note: before running take a look inside wgm.ts and tinker with stuff
deno run -A wgm.ts
```

By default, the script will setup firewall, wireguard server, and create two peers
