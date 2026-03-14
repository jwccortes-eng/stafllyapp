
-- Delete the stuck message from the queue
SELECT pgmq.purge_queue('transactional_emails');
