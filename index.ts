import { getLogsExporter } from "./LogsExporter";
import { getS3Helper } from "./S3";

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
