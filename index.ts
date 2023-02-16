import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
  CreateExportTaskCommand,
  DeleteLogStreamCommand,
  DescribeLogStreamsCommand,
  DescribeExportTasksCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import dayjs from "dayjs";

const config = {
  apiVersion: "2014-03-28",
  region: "eu-west-2",
};

const limit = 50;

const client = new CloudWatchLogsClient(config);
let total: any = [];
let logGroups: string[] = [];
const numWeeks = 6;
const now = new Date();
const sixWeeksAgo = now.setDate(now.getDate() - numWeeks * 7);

const timeout = async (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Get a list of all log groups
 * @param nextToken
 * @returns
 */
const getLogGroups = async (nextToken: string | undefined = undefined) => {
  const command = new DescribeLogGroupsCommand({ limit, nextToken });
  const response = await client.send(command);
  console.log("token:", response.nextToken);
  response.logGroups?.map((logGroup) => {
    if (
      logGroup.logGroupName?.includes("prod-") &&
      !logGroup.logGroupName?.includes("preprod-")
    )
      logGroups.push(<string>logGroup.logGroupName);
  });

  if (response.logGroups && response.logGroups.length > 0)
    total = [...total, ...response.logGroups];

  let data: any;
  while (response.nextToken !== undefined) {
    await timeout(250).then(async () => {
      data = await getLogGroups(response.nextToken);
    });
    return data;
  }
};

const describeLogGroupStreams = async (logGroupName: string) => {
  if (!logGroupName) return;
  const params = {
    logGroupName,
    orderBy: "LastEventTime",
    //descending: true,
  };
  const command = new DescribeLogStreamsCommand(params);
  const response = await client.send(command);
  // console.log({ response });
  //console.log({ logStreams: response.logStreams });
  if (!response.logStreams?.length) return;
  // get the first record as the oldest timestamp
  const oldestCreationTimestamp =
    response.logStreams[0].firstEventTimestamp ??
    response.logStreams[0].creationTime;
  console.log({ oldestCreationTimestamp });
  console.log(dayjs(oldestCreationTimestamp).format("YYYY-MM-DD HH:mm:ss"));
  console.log({ logGroupName });
  return oldestCreationTimestamp;
};

/**
 * Initialise a log group stream export to S3
 * @param logGroupName
 */
const exportLogGroupStream = async (logGroupName: string) => {
  if (!logGroupName) return;
  console.log(
    "sending create export task command for log group name: ",
    logGroupName
  );
  const timestampFrom = await describeLogGroupStreams(logGroupName);
  const logGroupNameArr = logGroupName.split("/"); //'/aws/lambda/staging-EmailsGetEmailTemplates-v2'
  const groupName = logGroupNameArr[logGroupNameArr.length - 1];
  const taskName = `${dayjs().format("YYYY-MM-DD HH:mm:ss")}--${groupName}`;
  const params = {
    destination: "clearabee-cloudwatch-logs",
    //from: sixWeeksAgo,
    // from: now.setDate(now.getDate() - numWeeks * 120),
    from: timestampFrom ?? 1615290278120,
    logGroupName,
    to: new Date().getTime(),
    //to: sixWeeksAgo,
    taskName,
    destinationPrefix: `exportedLogs/${groupName}/${dayjs().format(
      "YYYY-MM-DD"
    )}`,
  };
  const command = new CreateExportTaskCommand(params);
  if (logGroupName) return (await client.send(command)) ?? false;
};

/**
 * Check for any running export tasks first, if none running then proceed to create a new export task
 * with the supplied logGroupName
 * @param logGroupName
 * @returns
 */
const describeExportTasks = async (logGroupName?: string) => {
  const command = new DescribeExportTasksCommand({});
  const response = await client.send(command);
  console.log({ describeExportTasks: response });

  let reRun = false;
  console.log({ reRun });

  response.exportTasks?.map(async (task) => {
    if (task.status?.code == "RUNNING" || task.status?.code == "PENDING") {
      console.log({ runningTask: task });
      reRun = true;
    }
  });
  console.log({ reRun });

  if (reRun)
    return new Promise(async (resolve, reject) => {
      console.log("setting timeout 10 seconds");
      await timeout(10000).then(async () => {
        console.log("rerunning describeExportTasks() after waiting 10 seconds"),
          resolve(await describeExportTasks());
      });
    });

  return await exportLogGroupStream(logGroupName as string);
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
    //query: "logStreams[*].logStreamName",
  });
  const response = await client.send(command);
  const arr = response.logStreams || [];
  if (arr.length > 0)
    for (let i = 0; i <= arr.length; i++) {
      if (arr[i] !== undefined && arr[i].hasOwnProperty("lastEventTimestamp"))
        if (<number>arr[i].lastEventTimestamp < sixWeeksAgo) {
          await timeout(250).then(
            async () =>
              await deleteLogStream(logGroupName, <string>arr[i].logStreamName)
          );
        }
    }

  let data: any;
  while (response.nextToken !== undefined) {
    console.log(`awaiting 500... with token ${response.nextToken}`);
    await timeout(250).then(async () => {
      console.log("250 over, recursiving...");
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
  console.log(`logGroups length: ${logGroups.length}`);
  let i = logGroups.length;

  for (let i = 0; i <= logGroups.length; i++) {
    await timeout(250).then(async () => {
      console.log(`deleting streams for ${logGroups[i]}`);
      await deleteLogGroupStreams(logGroups[i]);
    });
  }
};

const exportStreams = async () => {
  // await exportLogGroupStream(
  //   "/aws/lambda/dev-catalogues-SupplierPriceUpsertedSubscr-v2"
  // );
  // console.log(`logGroups length: ${logGroups.length}`);
  // let i = logGroups.length;

  for (let i = 0; i <= logGroups.length; i++) {
    await timeout(1000).then(async () => {
      console.log("describing export tasks");
      await describeExportTasks(logGroups[i]);
    });
  }
};

const start = new Date().getSeconds();
(async () => {
  // await getLogGroups().then(async (d) => {
  //   await deleteStreams().then(() => {
  //     const end = new Date().getSeconds();
  //     console.log(`completed in: ${end - start} seconds`);
  //     console.log(`total records fetched: ${total.length}`);
  //   });
  // });
  await getLogGroups().then(async (d) => {
    await exportStreams().then(() => {
      const end = new Date().getSeconds();
      console.log(`completed in: ${end - start} seconds`);
      console.log(`total records fetched: ${total.length}`);
    });
  });
  //await exportStreams();
  //await describeExportTasks();
})();
