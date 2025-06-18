#!/bin/bash


rabbitmq-server &


RABBITMQ_USER=${RABBITMQ_DEFAULT_USER:-admin}
RABBITMQ_PASS=${RABBITMQ_DEFAULT_PASS:-admin}
RABBITMQ_TTL=${RABBITMQ_VALIDATION_FAILURES_TTL:-86400000}

echo "$(date '+%Y-%m-%d %H:%M:%S') Using RabbitMQ credentials: $RABBITMQ_USER / [password hidden]"
echo "$(date '+%Y-%m-%d %H:%M:%S') Using TTL: $RABBITMQ_TTL ms"
echo "$(date '+%Y-%m-%d %H:%M:%S') Waiting for RabbitMQ to start..."
sleep 10


MAX_ATTEMPTS=30
ATTEMPT=1

while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
  echo "$(date '+%Y-%m-%d %H:%M:%S') Attempting to connect to RabbitMQ Management API (attempt $ATTEMPT/$MAX_ATTEMPTS)..."
  
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -u "$RABBITMQ_USER:$RABBITMQ_PASS" http://localhost:15672/api/overview)
  
  if [ "$HTTP_CODE" = "200" ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') Successfully connected to RabbitMQ Management API"
    break
  else
    echo "$(date '+%Y-%m-%d %H:%M:%S') Failed to connect to RabbitMQ Management API (HTTP code: $HTTP_CODE)"
    
    if [ "$HTTP_CODE" = "401" ]; then
      echo "$(date '+%Y-%m-%d %H:%M:%S') Authentication failed. Listing RabbitMQ users:"
      rabbitmqctl list_users
    fi
    
    sleep 2
    ATTEMPT=$((ATTEMPT+1))
  fi
done

if [ $ATTEMPT -gt $MAX_ATTEMPTS ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') Failed to connect to RabbitMQ Management API after $MAX_ATTEMPTS attempts"
  echo "$(date '+%Y-%m-%d %H:%M:%S') Continuing anyway to keep container running..."
else

  echo "$(date '+%Y-%m-%d %H:%M:%S') Creating validation-failures queue with TTL of $RABBITMQ_TTL ms..."
  

  QUEUE_ARGS="{\"x-message-ttl\":$RABBITMQ_TTL, \"x-queue-type\":\"quorum\"}"
  

  QUEUE_RESULT=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
    -u "$RABBITMQ_USER:$RABBITMQ_PASS" \
    -H "Content-Type: application/json" \
    -d "{\"durable\":true, \"arguments\":$QUEUE_ARGS}" \
    http://localhost:15672/api/queues/%2F/validation-failures)
  
  if [ "$QUEUE_RESULT" = "201" ] || [ "$QUEUE_RESULT" = "204" ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') Successfully created/updated validation-failures queue"
  else
    echo "$(date '+%Y-%m-%d %H:%M:%S') Failed to create validation-failures queue (HTTP code: $QUEUE_RESULT)"
  fi
  

  echo "$(date '+%Y-%m-%d %H:%M:%S') Verifying queue creation:"
  rabbitmqctl list_queues name arguments
fi


echo "$(date '+%Y-%m-%d %H:%M:%S') RabbitMQ setup complete, keeping container running..."


rabbitmqctl stop


sleep 5


exec rabbitmq-server