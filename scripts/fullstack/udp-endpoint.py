"""Docker-only per-bulb UDP endpoint; forwards bytes without protocol translation."""
import asyncio
from pathlib import Path
import socket
import sys


class Endpoint(asyncio.DatagramProtocol):
    def __init__(self, remote):
        self.remote = remote
        self.transport = None
        self.upstreams = {}
        self.pending = {}

    def connection_made(self, transport):
        self.transport = transport

    def datagram_received(self, data, addr):
        if addr in self.upstreams:
            self.upstreams[addr].sendto(data)
        elif addr in self.pending:
            self.pending[addr].append(data)
        else:
            self.pending[addr] = [data]
            asyncio.create_task(self.connect(addr))

    async def connect(self, addr):
        # Each sender gets its own upstream socket: replies cannot be delivered to
        # a different driver/controller merely because it sent the latest packet.
        transport, _ = await asyncio.get_running_loop().create_datagram_endpoint(
            lambda: Reply(self.transport, addr), remote_addr=self.remote)
        self.upstreams[addr] = transport
        for data in self.pending.pop(addr):
            transport.sendto(data)


class Reply(asyncio.DatagramProtocol):
    def __init__(self, downstream, client):
        self.downstream = downstream
        self.client = client

    def datagram_received(self, data, addr):
        self.downstream.sendto(data, self.client)


async def main():
    listen, host, target = sys.argv[1:]
    loop = asyncio.get_running_loop()
    addresses = await loop.getaddrinfo(host, int(target), family=socket.AF_INET, type=socket.SOCK_DGRAM)
    endpoint = Endpoint(addresses[0][4])
    await loop.create_datagram_endpoint(lambda: endpoint, local_addr=("0.0.0.0", int(listen)))
    Path('/tmp/ready').touch()
    await asyncio.Event().wait()


if __name__ == '__main__':
    asyncio.run(main())
