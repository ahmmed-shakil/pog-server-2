import { DeleteMessageCommand, ReceiveMessageCommand } from '@aws-sdk/client-sqs';
import 'dotenv/config';
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { env } from './config/envValidate';
import { getSignedFileUrl, queueURL, sqsClient } from './constants/AWS';
import { downloader } from './helper/downloader';
import { getDataFromFile } from './helper/getDataFromFile';
import { sendDataToDb } from './helper/sendDataToDB';

const app = express();
const downloadsDir = path.join(__dirname, 'downloads');

// Function to receive and process a message from the SQS queue
const receiveMessage = async () => {
  // Parameters for SQS receiveMessage API
  const params = {
    QueueUrl: queueURL, // The URL of the SQS queue to poll messages from
    MaxNumberOfMessages: 1, // Process one message at a time (adjust if needed)
    VisibilityTimeout: 500, // How long to keep the message hidden from other consumers (in seconds)
    WaitTimeSeconds: 0, // No long polling; return immediately if no messages are available
  };

  try {
    // Receive a message from SQS
    const command = new ReceiveMessageCommand(params);
    const data = await sqsClient.send(command);
    const Messages = data.Messages; // Array of messages received

    if (Messages && Messages[0].Body) {
      // Parse the message body (assuming it's JSON formatted)
      const body = JSON.parse(Messages[0].Body);
      const receiptHandle = Messages[0].ReceiptHandle; // To delete the message after processing

      // Get the bucket name and object key from the message (S3 event notification)
      const bucketName = body.Records[0].s3.bucket.name;
      const objectKey = body.Records[0].s3.object.key;

      // Get a signed URL for the S3 object (allows us to download it)
      const result = await getSignedFileUrl(objectKey, bucketName);

      // Download the file from the S3 signed URL
      const { filePath } = await downloader(result);
      if (!filePath) {
        throw new Error('Failed to download file');
      }

      // Read the contents of the downloaded file
      const response = await getDataFromFile(filePath);
      console.log('🚀 ~ receiveMessage ~ response:', response);
      if (!response) {
        throw new Error('Failed to extract data from file');
      }

      // Send the extracted data to the database for storage
      const fileProcessingStatus = await sendDataToDb(response);
      // console.log(fileProcessingStatus, 'status');

      if (!fileProcessingStatus) {
        throw new Error('Failed to send data to database');
      }

      // After successful processing, delete the message from the SQS queue
      const deleteParams = {
        QueueUrl: queueURL,
        ReceiptHandle: receiptHandle, // Use receipt handle to delete the exact message
      };
      const deleteCommand = new DeleteMessageCommand(deleteParams);
      await sqsClient.send(deleteCommand);
      console.log('Message deleted from the queue');

      // Delete the local file after processing it successfully
      await fs.unlink(filePath);
      console.log('File deleted from local storage');
    }
  } catch (err) {
    console.log('Receive Error', err); // Log any errors encountered during message processing
  } finally {
    // Call receiveMessage again to poll for the next message after processing the current one
    // This ensures continuous polling after each message has been fully processed
    await receiveMessage(); // Call the function recursively (poll continuously without delay)
  }
};

// Start polling messages
receiveMessage();

// Start Express server to listen for incoming requests (if needed)
app.listen(env.PORT, () => {
  console.log(`listening to port ${env.PORT}`);
});
