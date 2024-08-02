import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
  CreateExportTaskCommand,
  DeleteLogStreamCommand,
  DescribeLogStreamsCommand,
  DescribeExportTasksCommand,
  DescribeExportTasksCommandOutput,
  CreateExportTaskCommandInput,
  ExportTask,
  CreateExportTaskCommandOutput,
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
let skippedLogGroups: string[] = [];
let runningTaskIds: string[] = [];
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
  console.log(`getting ${limit} log groups from token: ${nextToken}`);
  const command = new DescribeLogGroupsCommand({ limit, nextToken });
  const response = await client.send(command);
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

const getOldestCreationTimestamp = async (logGroupName: string) => {
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
  console.log({
    logGroupName,
    oldestCreationTimestamp,
    "oldestCreationTimestamp (friendly)": dayjs(oldestCreationTimestamp).format(
      "YYYY-MM-DD HH:mm:ss"
    ),
  });

  return oldestCreationTimestamp;
};

/**
 * Initialise a log group stream export to S3
 * @param logGroupName
 */
const exportLogGroupStream = async (
  logGroupName: string
): Promise<CreateExportTaskCommandOutput | undefined> => {
  if (!logGroupName) return;
  console.log(
    "sending create export task command for log group name: ",
    logGroupName
  );
  const timestampFrom = await getOldestCreationTimestamp(logGroupName);
  // ^^^ we need to wait for this to complete before we can proceed, ie STATUS: COMPLETED, send describeExportTasks(taskID) command
  // and if status is not COMPLETED, then we need to wait for it to complete before we can proceed
  if (!timestampFrom) {
    console.log(`skipping log group: ${logGroupName} as no timestamp found`);
    skippedLogGroups.push(logGroupName);
    return;
  }
  const logGroupNameArr = logGroupName.split("/"); //'/aws/lambda/staging-EmailsGetEmailTemplates-v2'
  const groupName = logGroupNameArr[logGroupNameArr.length - 1];
  const params: CreateExportTaskCommandInput = {
    destination: "clearabee-cloudwatch-logs",
    //from: sixWeeksAgo,
    // from: now.setDate(now.getDate() - numWeeks * 120),
    from: timestampFrom ?? 1615290278120,
    logGroupName,
    to: new Date().getTime(),
    //to: sixWeeksAgo,
    destinationPrefix: `exportedLogs/${groupName}/${dayjs().format(
      "YYYY-MM-DD"
    )}`,
  };
  params["taskName"] = `${dayjs().format(
    "YYYY-MM-DD HH:mm:ss"
  )}--${groupName} | export from: ${dayjs(params.from).format(
    "YYYY-MM-DD HH:mm:ss"
  )} - to: ${dayjs(params.to).format("YYYY-MM-DD HH:mm:ss")}`;

  const command = new CreateExportTaskCommand(params);
  const result: CreateExportTaskCommandOutput = await client.send(command);
  console.log({ result });

  // await new Promise(async (resolve, reject) => {
  //   console.log("setting timeout 10 seconds");
  //   await timeout(10000).then(async () => {
  //     resolve(await describeExportTasks(result.taskId));
  //   });
  // });

  // await timeout(250).then(async () => {
  //   const response = await describeExportTasks(result.taskId);
  //   while (response.exportTasks?.[0].status?.code === "RUNNING") {
  //     console.log("waiting 5 seconds...");
  //     await timeout(5000).then(async () => {
  //       console.log("rerunning describeExportTasks() after waiting 5 seconds"),
  //         (response = await describeExportTasks(result.taskId));
  //     });

  //   }
  // }
};

/**
 * Check the status of an export task, if completed then return the task else keep checking
 * @param logGroupName
 * @returns
 */
const describeExportTasks = async (taskId?: string) => {
  console.log(`checking export task status for taskId: ${taskId}`);
  if (!taskId) return;
  const command = new DescribeExportTasksCommand({
    taskId,
  });
  const response = await client.send(command);
  console.log({ response, exportTasks: response.exportTasks });
  const exportTask = response.exportTasks?.[0];
  console.log({ exportTask, status: { ...exportTask?.status } });
  console.log(`exportTask status: ${exportTask?.status?.code}`);
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
    `(TEST!) deleting logs for stream ${logStreamName} in log group ${logGroupName}`
  );
  return true;
  // const command = new DeleteLogStreamCommand({
  //   logGroupName,
  //   logStreamName,
  // });
  // try {
  //   const deleteResult = await client.send(command);
  //   console.log({ deleteResult });
  //   return deleteResult;
  // } catch (error) {
  //   console.log({ error });
  // }
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

  await exportLogGroupStream(`/aws/lambda/prod-adminAuthenticate`);
  // for (let i = 0; i <= logGroups.length; i++)
  //   await timeout(500).then(
  //     async () => await exportLogGroupStream(logGroups[i])
  //   );
};

const checkExportTaskStatus = async (
  taskId: string,
  maxRetries = 10,
  retryDelay = 5000
) => {
  let retries = 0;

  while (retries < maxRetries) {
    try {
      const command = new DescribeExportTasksCommand({
        taskId,
      });

      const response = await client.send(command);
      console.log({ response });

      const exportTask = response.exportTasks?.[0];
      if (exportTask) {
        const status = <string>exportTask.status;
        console.log(`Task status: ${status}`);

        if (status === "COMPLETED") {
          console.log("Export task completed successfully");
          return;
        } else if (status === "FAILED" || status === "CANCELLED") {
          console.error(`Export task failed or cancelled: ${status}, rerun?`);
          return;
        }
      } else {
        console.error("Export task not found");
        return;
      }
    } catch (error) {
      console.error("Error checking export task status:", error);
    }

    retries++;
    await new Promise((resolve) => setTimeout(resolve, retryDelay));
  }

  console.error("Maximum retries reached without task completion");
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
  // await getLogGroups().then(async (d) => {
  //   console.log(`Done, logGroups length: ${logGroups.length}`);
  //   // await exportStreams().then(() => {
  //   //   const end = new Date().getSeconds();
  //   //   console.log(`completed in: ${end - start} seconds`);
  //   //   console.log(`total records fetched: ${total.length}`);
  //   // });
  // });

  // await getLogGroups();
  // console.log(
  //   `getLogGroups() done, total log groups for export: ${logGroups.length}`
  // );
  console.log("exporting streams...");
  await exportStreams();
  console.log("exportStreams() done");
  console.log(`Running tasks: ${runningTaskIds.length}`);
  // check the status of the running tasks
  for (const taskId of runningTaskIds) {
    // await checkExportTaskStatus(taskId);
    await describeExportTasks(taskId);
  }
  // console.log(`Skipped log groups: ${skippedLogGroups.length}`);

  // TODO check running task id's statuses.  Tasks expire after 24 hours. We may have to cancel a running task perhaps?

  //await exportStreams();
  //await describeExportTasks();
})();
