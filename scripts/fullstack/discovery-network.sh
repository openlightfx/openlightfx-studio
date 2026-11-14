#!/bin/sh
# Runs only in the disposable Emby network namespace. Docker's internal bridge
# drops limited broadcasts (destination outside its subnet); use its directed
# broadcast instead. Never forward a discovery packet to the host or LAN.
set -eu
endpoint=$(getent hosts "$1" | awk 'NR == 1 {print $1}')
[ -n "$endpoint" ]
interface=$(ip -4 route get "$endpoint" | awk '{for(i=1;i<=NF;i++) if($i=="dev") {print $(i+1); exit}}')
broadcast=$(ip -o -4 addr show dev "$interface" | awk '{for(i=1;i<=NF;i++) if($i=="brd") {print $(i+1); exit}}')
[ -n "$broadcast" ]
# Select the private interface before NAT so the source address is private too.
ip route replace 255.255.255.255/32 dev "$interface"
for port in 38899 56700; do
  iptables -t nat -C OUTPUT -d 255.255.255.255/32 -p udp --dport "$port" -j DNAT --to-destination "$broadcast" 2>/dev/null ||
    iptables -t nat -A OUTPUT -d 255.255.255.255/32 -p udp --dport "$port" -j DNAT --to-destination "$broadcast"
done
printf 'Isolated discovery broadcast configured on %s\n' "$interface"
