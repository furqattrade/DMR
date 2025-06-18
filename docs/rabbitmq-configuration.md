# RabbitMQ Configuration Guide

This document provides instructions for configuring RabbitMQ for the DMR project, particularly focusing on queue setup.

## Validation Failures Queue

The validation failures queue (`validation-failures`) is a special error queue that requires specific configuration:

1. It needs a TTL (Time-To-Live) for messages
2. It should NOT have a Dead Letter Queue (DLQ)

### Docker Compose Configuration

The validation failures queue is configured at the RabbitMQ server level through Docker Compose. This ensures consistent queue properties and separates infrastructure concerns from application logic.

The configuration is defined in `docker-compose.yml` under the `rabbitmq-config` section:

```yaml
configs:
  rabbitmq-config:
    content: |
      # Queue definitions
      # Define the validation-failures queue as a quorum queue with TTL
      queue.declare.name = validation-failures
      queue.declare.durable = true
      queue.declare.arguments.x-queue-type = quorum
      queue.declare.arguments.x-message-ttl = ${RABBITMQ_VALIDATION_FAILURES_TTL:-86400000}
```

### Environment Variables

The TTL value can be configured using the environment variable:

```
RABBITMQ_VALIDATION_FAILURES_TTL=86400000  # 24 hours in milliseconds
```

This value is used by the application to log and monitor the expected TTL, but the actual TTL is set in the RabbitMQ server configuration.

## Other Queues

Other queues in the system are dynamically created by the application with their own Dead Letter Queues (DLQs) as needed.

## Troubleshooting

If you see a warning message like:

```
Validation failures queue 'validation-failures' not found. Please ensure it is defined in the RabbitMQ server configuration
```

This indicates that the queue has not been properly defined in the Docker Compose configuration. Check the following:

1. Verify that the `rabbitmq-config` section in `docker-compose.yml` contains the correct queue configuration
2. Make sure the environment variable `RABBITMQ_VALIDATION_FAILURES_TTL` is set in your `.env` file or has a default value in the Docker Compose config
3. Restart the RabbitMQ container with `docker-compose down` followed by `docker-compose up -d`
