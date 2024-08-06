import {
  S3Client,
  ListObjectsV2Command,
  ListObjectsV2Output,
  ListObjectsV2CommandInput,
} from "@aws-sdk/client-s3";

class S3Helper {
  private _s3Client: S3Client;
  private _bucketName = "clearabee-cloudwatch-logs";
  private _prefix = "exportedLogs/";

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
