import {
  LogGroup,
  ExportTask,
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
  DescribeLogGroupsCommandOutput,
  DescribeLogStreamsCommand,
  CreateExportTaskCommandOutput,
  CreateExportTaskCommandInput,
  CreateExportTaskCommand,
  DescribeExportTasksCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import dayjs from "dayjs";

import {
  S3Client,
  ListObjectsV2Command,
  ListObjectsV2Output,
  ListObjectsV2CommandInput,
} from "@aws-sdk/client-s3";

class S3Helper {
  private _s3Client: S3Client;
  private _bucketName = "clearabee-cloudwatch-logs";
  public _prefix = "daily/";

  constructor() {
    this._s3Client = new S3Client({
      apiVersion: "2014-03-28",
      region: "eu-west-2",
    });
  }

  async listDirectories(): Promise<(string | undefined)[]> {
    const params: ListObjectsV2CommandInput = {
      Bucket: this._bucketName,
      Prefix: this._prefix,
      Delimiter: "/",
    };

    const data: ListObjectsV2Output = await this._s3Client.send(
      new ListObjectsV2Command(params)
    );

    return data.CommonPrefixes?.map((prefix) => prefix.Prefix) || [];
  }
}

export const getS3Helper = () => new S3Helper();

class LogsExporter {
  private _limit = 50;
  private _total: LogGroup[] = [];
  public _logGroups: string[] = [];
  public _skippedLogGroups: string[] = [];
  public _failedTasks: ExportTask[] = [];
  public _cancelledTasks: ExportTask[] = [];

  constructor(private _client: CloudWatchLogsClient) {}

  timeout = async (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * Get a list of all log groups
   * @param nextToken
   * @returns
   */
  getLogGroups = async (
    nextToken: string | undefined = undefined
  ): Promise<LogGroup[] | undefined> => {
    console.log(`getting ${this._limit} log groups from token: ${nextToken}`);
    const command: DescribeLogGroupsCommand = new DescribeLogGroupsCommand({
      limit: this._limit,
      nextToken,
    });
    const response: DescribeLogGroupsCommandOutput = await this._client.send(
      command
    );
    response.logGroups?.map((logGroup: LogGroup) => {
      if (
        logGroup.logGroupName?.includes("prod-") &&
        !logGroup.logGroupName?.includes("preprod-")
      )
        this._logGroups.push(<string>logGroup.logGroupName);
    });

    if (response.logGroups && response.logGroups.length > 0)
      this._total = [...this._total, ...response.logGroups];

    let data: LogGroup[] | undefined;
    while (response.nextToken !== undefined) {
      await this.timeout(250).then(async () => {
        data = await this.getLogGroups(response.nextToken);
      });
      return data;
    }
    console.log(
      `getLogGroups() done, total log groups for export: ${this._logGroups.length}`
    );
    return this._total;
  };

  /**
   * Initialise a log group stream export to S3
   * Only one export task can be created per log group at a time
   * The export task will export all streams within the log group
   * Export tasks expire after 24 hours
   * @see https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_CreateExportTask.html
   * @param logGroupName
   */
  exportLogGroupStream = async (
    logGroupName: string
  ): Promise<CreateExportTaskCommandOutput | undefined> => {
    if (!logGroupName) return;
    console.log(
      "sending create export task command for log group name: ",
      logGroupName
    );

    const logGroupNameArr = logGroupName.split("/"); //'/aws/lambda/staging-EmailsGetEmailTemplates-v2'
    const groupName = logGroupNameArr[logGroupNameArr.length - 1];
    const params: CreateExportTaskCommandInput = {
      destination: "clearabee-cloudwatch-logs",
      from: dayjs().subtract(1, "day").startOf("day").valueOf(),
      logGroupName,
      to: dayjs().subtract(1, "day").endOf("day").valueOf(),
      destinationPrefix: `daily/${groupName}/${dayjs()
        .subtract(1, "day")
        .format("YYYY-MM-DD")}`,
    };
    params["taskName"] = `${dayjs().format(
      "YYYY-MM-DD HH:mm:ss"
    )}--${groupName} | export from: ${dayjs(params.from).format(
      "YYYY-MM-DD HH:mm:ss"
    )} - to: ${dayjs(params.to).format("YYYY-MM-DD HH:mm:ss")}`;

    const command = new CreateExportTaskCommand(params);
    const result: CreateExportTaskCommandOutput = await this._client.send(
      command
    );
    console.log({ result });

    // await new Promise(async (resolve, reject) => {
    //   console.log("setting timeout 10 seconds");
    //   await timeout(10000).then(async () => {
    //     resolve(await describeExportTasks(result.taskId));
    //   });
    // });

    await this.timeout(250).then(async () => {
      const response = await this.describeExportTasks(result.taskId);
      console.log("response from describeExportTasks()", { response });
    });
  };

  /**
   * Export all log group streams,
   * loops through all log groups and exports the streams individually
   * @returns
   */
  exportStreams = async (streams: string[]) => {
    for (let i = 0; i <= streams.length; i++)
      await this.timeout(500).then(
        async () => await this.exportLogGroupStream(streams[i])
      );

    console.log(`Skipped log groups: ${this._skippedLogGroups.length}`, {
      skippedLogGroups: this._skippedLogGroups,
    });
    console.log(`Failed tasks: ${this._failedTasks.length}`, {
      failedTasks: this._failedTasks,
    });
  };

  /**
   * Check the status of an export task, if completed then return the task else keep checking
   * @param logGroupName
   * @returns
   */
  describeExportTasks = async (taskId?: string) => {
    console.log(`checking export task status for taskId: ${taskId}`);
    if (!taskId) return;
    const command = new DescribeExportTasksCommand({
      taskId,
    });
    const response = await this._client.send(command);
    console.log({ response, exportTasks: response.exportTasks });
    const exportTask = response.exportTasks?.[0];
    if (!exportTask) return;
    console.log({ exportTask });
    return this.handleDescribeExportTaskResponse(exportTask);
  };

  /**
   * Determines the status of an export task and acts accordingly
   * @param exportTask
   * @returns
   */
  handleDescribeExportTaskResponse = (exportTask: ExportTask) => {
    const status = <string>exportTask?.status?.code;
    const taskId = <string>exportTask?.taskId;
    const functions: Record<string, any> = {
      COMPLETED: () => {
        console.log("Export task completed successfully");
        return exportTask;
      },
      FAILED: () => {
        console.error(`Export task ${taskId} failed or cancelled: ${status}`);
        this._failedTasks.push(exportTask);
        return exportTask;
      },
      CANCELLED: () => {
        console.error(`Export task ${taskId} failed or cancelled: ${status}`);
        this._cancelledTasks.push(exportTask);
        return exportTask;
      },
      RUNNING: async () => this.reDescribeTask(taskId),
      PENDING: async () => this.reDescribeTask(taskId),
    };
    return functions[status]();
  };

  /**
   * Re-describe a task if it is still running or pending
   * @param taskId
   * @returns
   */
  reDescribeTask = async (taskId: string) =>
    await this.timeout(5000).then(async () => {
      console.log(
        `re-describing task... ${taskId}`,
        `current time: ${dayjs().format("YYYY-MM-DD HH:mm:ss")}`
      );
      await this.describeExportTasks(taskId);
    });
}

export const getLogsExporter = (): LogsExporter =>
  new LogsExporter(
    new CloudWatchLogsClient({
      apiVersion: "2014-03-28",
      region: "eu-west-2",
    })
  );

(async () => {
  const start = new Date().getSeconds();
  console.log("Starting...", { start });

  const logsExporter = getLogsExporter();
  const s3Helper = getS3Helper();

  try {
    await logsExporter.getLogGroups();
    const logs = logsExporter["_logGroups"];
    console.log({ logs });
    const directories = await s3Helper.listDirectories();
    console.log({ directories });
    // replace the prefix in each directory with an empty string and replace the trailing slash with an empty string
    const logNames = logs.map((log) =>
      log
        ?.replace(s3Helper["_prefix"], "")
        .replace("aws/lambda/", "")
        .replace("/", "")
    );
    console.log({ logNames });

    // remove any directory that doesn't end with `-V2`
    const validLogs = logNames.filter((log) => log?.endsWith("-v2"));
    console.log({ validLogs }, { length: validLogs.length });

    // compare the `validLogs` array with the S3 `directories` array and remove any logs that has already been exported
    const logsToExport = validLogs.filter(
      (log) => !directories.includes(`${s3Helper["_prefix"]}${log}/`)
    );
    console.log({ logsToExport }, { length: logsToExport.length });

    // add the prefix back to the logs
    const logsToExportWithPrefix = logsToExport.map(
      (log) => `/aws/lambda/${log}`
    );
    console.log(
      { logsToExportWithPrefix },
      { length: logsToExportWithPrefix.length }
    );

    // export the logs
    await logsExporter.exportStreams(logsToExportWithPrefix);
    console.log("exportStreams() done");
    console.log({ skippedLogGroups: logsExporter["_skippedLogGroups"] });
    console.log({ failedTasks: logsExporter["_failedTasks"] });
    console.log({ cancelledTasks: logsExporter["_cancelledTasks"] });
  } catch (error) {
    console.error(error);
  }

  // // Tasks expire after 24 hours. If a task is still running after 24 hours, it will be cancelled.

  // console.log("Finished...", {
  //   end: new Date().getSeconds(),
  //   duration: new Date().getSeconds() - start,
  // });
})();
