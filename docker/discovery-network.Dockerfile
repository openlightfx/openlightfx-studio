FROM alpine:3.21
RUN apk add --no-cache iproute2 iptables
COPY scripts/fullstack/discovery-network.sh /discovery-network.sh
ENTRYPOINT ["sh", "/discovery-network.sh"]
