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

class LogsExporter {
  private _limit = 50;
  private _total: LogGroup[] = [];
  public _logGroups: string[] = [];
  public _skippedLogGroups: string[] = [];
  public _failedTasks: ExportTask[] = [];
  public _cancelledTasks: ExportTask[] = [];
  private _numWeeks = 6;
  private _now = new Date();
  private _sixWeeksAgo = this._now.setDate(
    this._now.getDate() - this._numWeeks * 7
  );

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
   * Get the oldest creation timestamp for a log group
   * @param logGroupName
   * @returns
   */
  getOldestCreationTimestamp = async (logGroupName: string) => {
    if (!logGroupName) return;
    const params = {
      logGroupName,
      orderBy: "LastEventTime",
      //descending: true,
    };
    const command = new DescribeLogStreamsCommand(params);
    const response = await this._client.send(command);
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
      "oldestCreationTimestamp (friendly)": dayjs(
        oldestCreationTimestamp
      ).format("YYYY-MM-DD HH:mm:ss"),
    });

    return oldestCreationTimestamp;
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
    const timestampFrom = await this.getOldestCreationTimestamp(logGroupName);
    if (!timestampFrom) {
      console.log(`skipping log group: ${logGroupName} as no timestamp found`);
      this._skippedLogGroups.push(logGroupName);
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

  /**
   * Get all streams for a log group
   * @param logGroupName
   * @param nextToken
   * @returns
   */
  deleteLogGroupStreams = async (
    logGroupName: string,
    nextToken?: string | undefined
  ) => {
    const command = new DescribeLogStreamsCommand({
      logGroupName,
      nextToken,
      //query: "logStreams[*].logStreamName",
    });
    const response = await this._client.send(command);
    const arr = response.logStreams || [];
    if (arr.length > 0)
      for (let i = 0; i <= arr.length; i++) {
        if (arr[i] !== undefined && arr[i].hasOwnProperty("lastEventTimestamp"))
          if (<number>arr[i].lastEventTimestamp < this._sixWeeksAgo) {
            await this.timeout(250).then(
              async () =>
                await this.deleteLogStream(
                  logGroupName,
                  <string>arr[i].logStreamName
                )
            );
          }
      }

    let data: any;
    while (response.nextToken !== undefined) {
      console.log(`awaiting 500... with token ${response.nextToken}`);
      await this.timeout(250).then(async () => {
        console.log("250 over, recursiving...");
        data = await this.deleteLogGroupStreams(
          logGroupName,
          response.nextToken
        );
      });
      return data;
    }
  };

  /**
   * Remove a log stream from a log group
   * @param logGroupName
   * @param logStreamName
   */
  deleteLogStream = async (logGroupName: string, logStreamName: string) => {
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

  deleteStreams = async () => {
    console.log(`logGroups length: ${this._logGroups.length}`);
    let i = this._logGroups.length;

    for (let i = 0; i <= this._logGroups.length; i++) {
      await this.timeout(250).then(async () => {
        console.log(`deleting streams for ${this._logGroups[i]}`);
        await this.deleteLogGroupStreams(this._logGroups[i]);
      });
    }
  };
}

export const getLogsExporter = (): LogsExporter =>
  new LogsExporter(
    new CloudWatchLogsClient({
      apiVersion: "2014-03-28",
      region: "eu-west-2",
    })
  );
