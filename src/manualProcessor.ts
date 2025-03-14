// manualProcessor.js
import fs from 'fs/promises';
import path from 'path';
import { getDataFromFile } from './helper/getDataFromFile';
import { sendDataToDb } from './helper/sendDataToDB';

const downloadsDir = path.join(__dirname, 'downloads');

// Function to process a specific file
async function processFile(filename: any) {
  const filePath = path.join(downloadsDir, filename);

  try {
    // Check if file exists
    await fs.access(filePath);

    // Extract data from the file
    const response = await getDataFromFile(filePath);
    if (!response) {
      console.error(`Failed to extract data from file: ${filename}`);
      return false;
    }

    // Send data to database
    const fileProcessingStatus = await sendDataToDb(response);
    if (!fileProcessingStatus) {
      console.error(`Failed to send data to database for file: ${filename}`);
      return false;
    }

    console.log(`Successfully processed file: ${filename}`);
    return true;
  } catch (error) {
    console.error(`Error processing file ${filename}:`, error);
    return false;
  }
}

// Function to process all files in the downloads directory
async function processAllFiles() {
  try {
    // Get all files in the downloads directory
    const files = await fs.readdir(downloadsDir);

    console.log(`Found ${files.length} files in downloads directory`);

    // Process each file
    for (const file of files) {
      console.log(`Processing ${file}...`);
      const success = await processFile(file);

      if (success) {
        // Delete the file after successful processing
        await fs.unlink(path.join(downloadsDir, file));
        console.log(`Deleted file: ${file}`);
      }
    }

    console.log('All files processed');
  } catch (error) {
    console.error('Error processing files:', error);
  }
}

// Run the processor
processAllFiles();
