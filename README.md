# DMR (Distributed Message Rooms)

## Business case

Currently, there is no way to pass questions from one Bürokratt instance to another. This means that if an end-user asks a question that the local Bürokratt instance cannot answer, he will receive no meaningful reply — even if some other Bürokratt instance could answer it.

An example: a user comes to the Tax Authority web, and asks a question about crime, the Tax Authority instance will not be able to answer it. The Police instance **is able** to answer the question but there is no way to forward it.

So the goal is to built a system that can efficiently and securely forward questions and answers between Bürokratt instances.

## Architecture chart

```mermaid
%%{ init: { "theme": "default", "flowchart": { "htmlLabels": true, "curve": "linear" } } }%%
graph TD
  subgraph Client A cluster
    A1[DMR Agent A]
    A2[Other Services A]
    A1 <--> A2
  end

  subgraph Central cluster
    S[DMR Server]:::bold
    MQ[RabbitMQ Cluster]
    CO((CentOps<br/><i>not in scope</i>)):::grey
  end

  subgraph Client B cluster
    B1[DMR Agent B]
    B2[Other Services B]
    B1 <--> B2
  end

  A1 <--> S
  B1 <--> S
  S <--> MQ
  CO -->|configuration| S

  classDef bold stroke:#333,stroke-width:2;
  classDef grey fill:#e0e0e0,stroke:#888,stroke-width:1;
```

## Key components

### DMR agents

- DMR agents run in every client's Bürokratt cluster. They are responsible for forwarding messages to the DMR Server and receiving messages from it in real-time. This is done via a WebSocket connection.
- DMR agents encrypt and decrypt messages using public-key cryptography. Private keys are delivered to the agents at infrastructure level. Other DMR agents' public keys are distributed by DMR server on establishing a WebSocket connection.
- Metadata needed to pass the messages along — like sender and recipient IDs — is not encrypted.
- The DMR agents also expose an API for communicating with other services in the client's Bürokratt cluster.

### DMR server

- Key functionality is to forward the messages between DMR agents using RabbitMQ.
- Uses WebSockets to exchange messages with DMR agents.
- Gets its configuration from CentOps. CentOps is developed separately and is **out of scope for this project**.
- Can also distribute configuration to DMR agents if necessary, namely a list of other DMR agents and their public keys.
- DMR server _itself_ is lightweight and stateless, it does not store any messages or configuration data in any sort of a DB.
- **Cannot** read the message contents, these are encrypted by the DMR agents.
- There can be several instances of DMR server running, depending on load.
- In the future, can potentially be extended to perform operations — like applying policies — on incoming and outgoing messages.
- Includes support for Prometheus-based monitoring to help track the real-time health and behavior of the DMR server, specifically around WebSocket activity and message processing.

### RabbitMQ

- Has per-Agent message queues.
- Has a dead letter queue for messages that failed to deliver.
- Has RabbitMQ UI-based monitoring tools set up.
- Supports RabbitMQ clustering for scalability.
- https://www.rabbitmq.com/kubernetes/operator/operator-monitoring

## Prometheus

### DMR server

List of metrics:

- **`dmr_socket_connections_active`** | `gauge`
  Current number of active Socket.IO connections

- **`dmr_socket_connections_total`** | `counter`
  Total number of established connections

- **`dmr_socket_disconnections_total`** | `counter`
  Total number of disconnections

- **`dmr_socket_connection_duration_seconds`** | `histogram`
  Duration of a socket connection session

- **`dmr_socket_errors_total`** | `counter`
  Total number of connection errors

- **`dmr_socket_events_received_total`** | `counter`
  Total events received from clients
  _(labels: `event`, `namespace`)_

- **`dmr_socket_events_sent_total`** | `counter`
  Total events sent to clients
  _(labels: `event`, `namespace`)_

- **`dmr_message_processing_duration_seconds`** | `histogram`
  Time to process/forward a single message

Suggested alert rules:

```yaml
groups:
  - name: dmr-server
    rules:
      # Too many disconnected clients suddenly (spike detection)

      - alert: DMRHighDisconnectionRate
        expr: increase(dmr_socket_disconnections_total[5m]) > 100
        for: 2m
        labels:
        severity: warning
        annotations:
        summary: 'High rate of disconnections in DMR Server'

      # Low number of active connections (possible outage)

      - alert: DMRServerSocketsDown
        expr: dmr_socket_connections_active< 1
        for: 1m
        labels:
        severity: critical
        annotations:
        summary: 'No active socket connections detected on DMR Server'

      # Slow message routing

      - alert: DMRServerMessageRoutingLatencyHigh
        expr: histogram_quantile(0.95, rate(dmr_message_processing_duration_seconds[5m])) > 0.5
        for: 2m
        labels:
        severity: warning
        annotations:
        summary: '95th percentile message routing time exceeds 500ms'
```

### DMR agent

---

## Available Scripts

### Development

- `start:server`: Start the DMR server in development mode
- `start:agent`: Start the DMR agent in development mode

### Building

- `build`: Build all applications
- `build:server`: Build only the DMR server
- `build:agent`: Build only the DMR agent

### Testing

- `test`: Run tests for all applications
- `test:server`: Run tests for DMR server
- `test:agent`: Run tests for DMR agent
- `e2e`: Run end-to-end tests for all applications
- `e2e:server`: Run end-to-end tests for DMR server
- `e2e:agent`: Run end-to-end tests for DMR agent

For detailed test output, you can add the `--reporter=verbose` flag to any test command:

```bash
pnpm test:server -- --reporter=verbose
pnpm e2e:server -- --reporter=verbose
```

### Code Quality

- `lint`: Run ESLint on all files
- `lint:check`: Check for ESLint errors with zero warnings allowed
- `lint:fix`: Fix auto-fixable ESLint issues
- `format`: Format code using Prettier
- `format:check`: Check code formatting

### Utility

- `clean`: Clean build artifacts and cache

## Environment Variables

Below is a list of all environment variables used by the DMR system, organized by service.

### DMR Server

| Variable                                | Description                                       | Default Value        |
| --------------------------------------- | ------------------------------------------------- | -------------------- |
| `PORT`                                  | Port on which the DMR server will run             | `5000`               |
| `ENVIRONMENT`                           | Runtime environment                               | `development`        |
| `LOGGER_COLORS`                         | Enable colored logs                               | `true`               |
| `LOGGER_LOG_LEVELS`                     | Comma-separated log levels to output              | `error,warn,log`     |
| `WEB_SOCKET_MAX_DISCONNECTION_DURATION` | Maximum duration (ms) for WebSocket disconnection | `120000`             |
| `CENTOPS_CONFIGURATION_URL`             | URL for CentOps configuration service             | Required, no default |
| `CENTOPS_CONFIGURATION_CRON_TIME`       | Cron schedule for fetching CentOps configuration  | `*/30 * * * *`       |
| `MOCK_DMR_AGENT_A_PUBLIC_KEY`           | Public key for mock Agent A (development/testing) | N/A                  |
| `MOCK_DMR_AGENT_B_PUBLIC_KEY`           | Public key for mock Agent B (development/testing) | N/A                  |
| `MOCK_DMR_AGENT_A_ID`                   | UUID for mock Agent A (development/testing)       | N/A                  |
| `MOCK_DMR_AGENT_B_ID`                   | UUID for mock Agent B (development/testing)       | N/A                  |

### DMR Agent

| Variable                           | Description                                              | Default Value        |
| ---------------------------------- | -------------------------------------------------------- | -------------------- |
| `PORT`                             | Port on which the DMR agent will run                     | `5001`               |
| `ENVIRONMENT`                      | Runtime environment                                      | `development`        |
| `LOGGER_COLORS`                    | Enable colored logs                                      | `true`               |
| `LOGGER_LOG_LEVELS`                | Comma-separated log levels to output                     | `error,warn,log`     |
| `DMR_SERVER_WEBSOCKET_URL`         | WebSocket URL for connecting to DMR server               | Required, no default |
| `WEBSOCKET_RECONNECTION_DELAY`     | Initial delay (ms) for WebSocket reconnection attempts   | `1000`               |
| `WEBSOCKET_RECONNECTION_DELAY_MAX` | Maximum delay (ms) for WebSocket reconnection attempts   | `5000`               |
| `AGENT_ID`                         | Unique identifier (UUID) for the agent                   | Required, no default |
| `AGENT_PRIVATE_KEY`                | RSA private key for message encryption/decryption        | Required, no default |
| `OUTGOING_MESSAGE_ENDPOINT`        | HTTP endpoint where decrypted messages will be forwarded | Optional             |

### RabbitMQ

| Variable                                      | Description                                | Default Value         |
| --------------------------------------------- | ------------------------------------------ | --------------------- |
| `RABBITMQ_DEFAULT_USER`                       | Username for RabbitMQ authentication       | Required, no default  |
| `RABBITMQ_DEFAULT_PASS`                       | Password for RabbitMQ authentication       | Required, no default  |
| `RABBITMQ_DEFAULT_TTL`                        | Default message TTL (ms)                   | `300000` (5 minutes)  |
| `RABBITMQ_DEFAULT_PORT`                       | Port for RabbitMQ AMQP connection          | Required, no default  |
| `RABBITMQ_DEFAULT_HOST`                       | Hostname for RabbitMQ connection           | Required, no default  |
| `RABBITMQ_DEFAULT_MANAGEMENT_UI_URI`          | URI for RabbitMQ management interface      | Required, no default  |
| `RABBITMQ_DEFAULT_DLQ_TTL`                    | TTL (ms) for messages in dead letter queue | `86400000` (24 hours) |
| `RABBITMQ_VALIDATION_FAILURES_TTL`            | TTL (ms) for validation failure messages   | `86400000` (24 hours) |
| `RABBITMQ_DEFAULT_DEFAULT_RECONNECT_INTERVAL` | Interval (ms) for reconnection attempts    | `5000` (5 seconds)    |
