const shell = Deno.env.get("SHELL") ?? "/bin/bash";

async function sh(cmd: string, stdout: "piped"): Promise<string>;
async function sh(cmd: string, stdout: "inherit"): Promise<void>;
async function sh(
  cmd: string,
  stdout: "piped" | "inherit"
): Promise<string | void> {
  const child = Deno.run({
    cmd: [shell, "-c", cmd],
    stdout,
    stderr: "inherit",
    stdin: "null",
  });
  try {
    if (stdout == "piped") {
      const buf = await child.output();
      return new TextDecoder().decode(buf).trimEnd();
    } else {
      await child.status();
    }
  } finally {
    child.close();
  }
}
const $ = (cmd: string) => sh(cmd, "inherit");
const $$ = (cmd: string) => sh(cmd, "piped");

const server_port = 51820;
const private_subnet_v4 = "10.0.0.0/8";
const gateway_address_v4 = "10.0.0.1/8";
const private_subnet_v6 = "fd00:00:00::0/8";
const gateway_address_v6 = "fd00:00:00::1/8";
const cf_dns = "1.1.1.1,1.0.0.1,2606:4700:4700::1111,2606:4700:4700::1001";
const wg_nic = "wg0";
const default_nic = await $$(
  `ip route | grep default | head --lines=1 | cut --delimiter=" " --fields=5`
);
const server_host = await $$(`curl ifconfig.me/ip`);

await $(`sudo apt update`);
await $(`sudo apt upgrade`);
await $(`sudo apt install resolvconf wireguard -y`);

await $(`sudo apt install ufw`);
await $(`sudo ufw allow ssh`);
await $(`sudo ufw allow ${server_port}/udp`);
await $(`echo "y" | sudo ufw enable`);

await $(`
cd /etc/wireguard;
umask 077;
wg genkey | tee private_key | wg pubkey > public_key;
`);

const server_private_key = await $$(`wg genkey`);
const server_public_key = await $$(`echo ${server_private_key} | wg pubkey`);
const server_config = `# ${wg_nic}.conf
[Interface]
Address = ${gateway_address_v4},${gateway_address_v6}
ListenPort = ${server_port}
DNS = ${cf_dns}
MTU = 1420
PrivateKey = ${server_private_key}
SaveConfig = false
PostUp = ${[
  `sysctl --write net.ipv4.ip_forward=1`,
  `sysctl --write net.ipv6.conf.all.forwarding=1`,
  `iptables -A FORWARD -i ${wg_nic} -j ACCEPT`,
  `iptables -t nat -A POSTROUTING -o ${default_nic} -j MASQUERADE`,
  `ip6tables -A FORWARD -i ${wg_nic} -j ACCEPT`,
  `ip6tables -t nat -A POSTROUTING -o ${default_nic} -j MASQUERADE`,
].join("; ")}
PostDown = ${[
  `sysctl --write net.ipv4.ip_forward=0`,
  `sysctl --write net.ipv6.conf.all.forwarding=0`,
  `iptables -D FORWARD -i ${wg_nic} -j ACCEPT`,
  `iptables -t nat -D POSTROUTING -o ${default_nic} -j MASQUERADE`,
  `ip6tables -D FORWARD -i ${wg_nic} -j ACCEPT`,
  `ip6tables -t nat -D POSTROUTING -o ${default_nic} -j MASQUERADE`,
].join("; ")}
`;
await Deno.writeTextFile(`/etc/wireguard/${wg_nic}.conf`, server_config);

async function add_peer(peer_name: string) {
  const client_private_key = await $$(`wg genkey`);
  const client_public_key = await $$(`echo ${client_private_key} | wg pubkey`);
  const preshared_key = await $$(`wg genpsk`);
  const peer_port = Math.trunc(1024 + Math.random() * (65_535 - 1024));
  const current_server_config = await Deno.readTextFile(
    `/etc/wireguard/${wg_nic}.conf`
  );
  const number_of_peers = current_server_config.match(/\[Peer\]/)?.length ?? 0;
  const next_peer = 1 + 1 + number_of_peers;
  const [ip_v4, mask_v4] = private_subnet_v4.split("/");
  const client_address_v4 = ip_v4.replace(/\.[^.]+$/, `.${next_peer}`);
  const [ip_v6, mask_v6] = private_subnet_v6.split("/");
  const client_address_v6 = ip_v6.replace(
    /::[^:]+$/,
    `::${next_peer.toString(16)}`
  );
  const server_part = `# ${peer_name}
[Peer]
PublicKey = ${client_public_key}
PresharedKey = ${preshared_key}
AllowedIPs = ${client_address_v4}/32,${client_address_v6}/128
`;
  const client_config = `# https://www.wireguard.com
[Interface]
Address = ${client_address_v4}/${mask_v4},${client_address_v6}/${mask_v6}
DNS = ${cf_dns}
ListenPort = ${peer_port}
MTU = 1280
PrivateKey = ${client_private_key}

[Peer]
Endpoint = ${server_host}:${server_port}
PersistentKeepalive = 25
PublicKey = ${server_public_key}
PresharedKey = ${preshared_key}
AllowedIPs = 0.0.0.0/0,::/0
`;
  const next_server_config = `${current_server_config}\n${server_part}`;
  await Deno.writeTextFile(`/etc/wireguard/${wg_nic}.conf`, next_server_config);
  await Deno.writeTextFile(`/etc/wireguard/${peer_name}.conf`, client_config);
}

await add_peer("phone");
await add_peer("laptop");

await $(`wg-quick down ${wg_nic}`);
await $(`wg-quick up ${wg_nic}`);
await $(`systemctl enable wg-quick@${wg_nic}`);
await $(`wg show`)
