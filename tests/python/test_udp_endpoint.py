"""Test byte-preserving Docker UDP relay with actual sockets and two senders."""
import asyncio
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('udp_endpoint', Path(__file__).resolve().parents[2] / 'scripts/fullstack/udp-endpoint.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Client(asyncio.DatagramProtocol):
    def __init__(self): self.responses = asyncio.Queue()
    def datagram_received(self, data, addr): self.responses.put_nowait(data)


class Echo(asyncio.DatagramProtocol):
    def connection_made(self, transport): self.transport = transport
    def datagram_received(self, data, addr):
        asyncio.get_running_loop().call_later(.03, self.transport.sendto, data, addr)


class EndpointTests(unittest.IsolatedAsyncioTestCase):
    async def test_ordered_bytes_and_replies_stay_with_their_sender(self):
        loop = asyncio.get_running_loop()
        server, _ = await loop.create_datagram_endpoint(Echo, local_addr=('127.0.0.1', 0))
        endpoint = module.Endpoint(server.get_extra_info('sockname'))
        relay, _ = await loop.create_datagram_endpoint(lambda: endpoint, local_addr=('127.0.0.1', 0))
        a, ca = await loop.create_datagram_endpoint(Client, local_addr=('127.0.0.1', 0))
        b, cb = await loop.create_datagram_endpoint(Client, local_addr=('127.0.0.1', 0))
        try:
            target = relay.get_extra_info('sockname')
            a.sendto(b'\x00first\xff', target)
            b.sendto(b'other sender', target)
            a.sendto(b'second', target)
            self.assertEqual(await asyncio.wait_for(ca.responses.get(), 2), b'\x00first\xff')
            self.assertEqual(await asyncio.wait_for(ca.responses.get(), 2), b'second')
            self.assertEqual(await asyncio.wait_for(cb.responses.get(), 2), b'other sender')
            self.assertTrue(ca.responses.empty())
            self.assertTrue(cb.responses.empty())
        finally:
            for transport in [a, b, relay, server, *endpoint.upstreams.values()]: transport.close()


if __name__ == '__main__': unittest.main()
