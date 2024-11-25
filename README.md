# CW Logs to S3 Exporter

This repository provides an automated solution to export AWS CloudWatch log streams to an S3 bucket and manage log storage by deleting old log streams. The script is written in TypeScript and leverages the AWS SDK for JavaScript (v3).

## Overview

The **CW Logs to S3 Exporter** automates the process of:

- Exporting CloudWatch log streams to a specified S3 bucket.
- Deleting log streams older than a defined retention period to optimize storage costs.

This solution is ideal for managing large amounts of log data efficiently while maintaining compliance with retention policies.

---

## Features

- **Log Group Filtering:** Exports only log groups that match a specific pattern (e.g., containing "dev-").
- **Export to S3:** Automatically initiates export tasks to archive logs in an S3 bucket.
- **Log Stream Deletion:** Deletes log streams older than six weeks after they have been exported.
- **Rate-Limited Execution:** Implements delays to respect AWS API rate limits.
- **Customizable Configuration:** Easily modify filters, export ranges, and retention periods.

---

## File Structure

### `index.ts`

The core script for managing CloudWatch logs and S3 exports.

- **AWS SDK Configuration:** Initializes a `CloudWatchLogsClient` to interact with CloudWatch Logs.
- **Log Group Retrieval:** Fetches log groups based on a filter (e.g., names containing "dev-").
- **Log Export:** Initiates export tasks to an S3 bucket for a specified time range.
- **Log Deletion:** Deletes log streams older than six weeks to maintain efficient log storage.

---

## Prerequisites

- **Node.js and npm/yarn:** Ensure that Node.js is installed on your system.
- **AWS CLI Configuration:** Set up AWS credentials with permissions for CloudWatch Logs and S3.
- **AWS SDK for JavaScript (v3):** Included as a dependency.

---

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/dave421/cw-logs-to-s3-exporter.git
   cd cw-logs-to-s3-exporter
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

---

## Usage

### Customize the Script

1. Open the `index.ts` file and update the `bucket` variable with your S3 bucket name:

   ```typescript
   const bucket = "your-s3-bucket-name";
   ```

2. Adjust the log group filter or retention period if needed.

### Run the Script

Execute the script to start exporting and managing logs:

```bash
ts-node index.ts
```

---

## Configuration

The following variables in the script can be customized:

- **`bucket`:** The name of the target S3 bucket for log exports.
- **`logGroupFilter`:** Filter log groups by name (e.g., "dev-").
- **Retention Period:** Defaults to six weeks for deleting old log streams.

---

## Error Handling

The script logs errors to the console for troubleshooting issues during the log export or deletion process.

---

## License

This project is licensed under the [MIT License](LICENSE).

---

## Acknowledgements

Special thanks to the AWS community for their documentation and support.
