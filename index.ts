import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
  CreateExportTaskCommand,
  DeleteLogStreamCommand,
  DescribeLogStreamsCommand,
} from "@aws-sdk/client-cloudwatch-logs";

const config = {
  apiVersion: "2014-03-28",
  region: "eu-west-2",
};
const limit = 50;
const bucket = "<your-bucket-name>";
const client = new CloudWatchLogsClient(config);
let total: any = [];
let logGroups: string[] = [];
const numWeeks = 6;
const now = new Date();
const sixWeeksAgo = now.setDate(now.getDate() - numWeeks * 7);
const timeout = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Get a list of all log groups
 * @param nextToken
 * @returns
 */
const getLogGroups = async (nextToken: string | undefined = undefined) => {
  const command = new DescribeLogGroupsCommand({ limit, nextToken });
  const response = await client.send(command);
  response.logGroups?.map((logGroup) => {
    // conditional check for log group name, remove if not needed
    if (logGroup.logGroupName?.includes("dev-"))
      logGroups.push(<string>logGroup.logGroupName);
  });

  if (response.logGroups && response.logGroups.length > 0)
    total = [...total, ...response.logGroups];

  let data: any;
  while (response.nextToken !== undefined) {
    await timeout(200).then(async () => {
      data = await getLogGroups(response.nextToken);
    });
    return data;
  }
};

/**
 * Initialise a log group stream export to S3
 * @param logGroupName
 */
const exportLogGroupStream = async (logGroupName: string) => {
  await timeout(1000);
  const params = {
    destination: bucket,
    from: sixWeeksAgo,
    logGroupName,
    to: new Date().getTime(),
    destinationPrefix: "exportedLogs",
  };
  const command = new CreateExportTaskCommand(params);
  const response = await client.send(command);
  console.log("log stream export result: ", { response });
};

/**
 * Get all streams for a log group
 * @param logGroupName
 * @param nextToken
 * @returns
 */
const deleteLogGroupStreams = async (
  logGroupName: string,
  nextToken?: string | undefined
) => {
  const command = new DescribeLogStreamsCommand({
    logGroupName,
    nextToken,
  });
  const response = await client.send(command);
  const arr = response.logStreams || [];
  if (arr.length > 0)
    for (let i = 0; i <= arr.length; i++) {
      if (arr[i] !== undefined && arr[i].hasOwnProperty("lastEventTimestamp"))
        if (<number>arr[i].lastEventTimestamp < sixWeeksAgo) {
          await timeout(200).then(
            async () =>
              await deleteLogStream(logGroupName, <string>arr[i].logStreamName)
          );
        }
    }

  let data: any;
  while (response.nextToken !== undefined) {
    console.log(`awaiting 500... with token ${response.nextToken}`);
    await timeout(200).then(async () => {
      data = await deleteLogGroupStreams(logGroupName, response.nextToken);
    });
    return data;
  }
};

/**
 * Remove a log stream from a log group
 * @param logGroupName
 * @param logStreamName
 */
const deleteLogStream = async (logGroupName: string, logStreamName: string) => {
  console.log(
    `deleting logs for stream ${logStreamName} in log group ${logGroupName}`
  );
  const command = new DeleteLogStreamCommand({
    logGroupName,
    logStreamName,
  });
  try {
    const deleteResult = await client.send(command);
    console.log({ deleteResult });
    return deleteResult;
  } catch (error) {
    console.log({ error });
  }
};

const deleteStreams = async () => {
  for (let i = 0; i <= logGroups.length; i++) {
    await timeout(200).then(async () => {
      console.log(`deleting streams for ${logGroups[i]}`);
      await deleteLogGroupStreams(logGroups[i]);
    });
  }
};

const start = new Date().getSeconds();
(async () => {
  await getLogGroups().then(async (d) => {
    await deleteStreams().then(() => {
      const end = new Date().getSeconds();
      console.log(`completed in: ${end - start} seconds`);
      console.log(`total records fetched: ${total.length}`);
    });
  });
})();
