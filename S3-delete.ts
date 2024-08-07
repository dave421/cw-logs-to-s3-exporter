import {
  S3Client,
  ListObjectsV2Command,
  ListObjectsV2Output,
  ListObjectsV2CommandInput,
  DeleteObjectCommand,
  DeleteObjectCommandInput,
} from "@aws-sdk/client-s3";

class S3Helper {
  private _s3Client: S3Client;
  private _bucketName = "clearabee-cloudwatch-logs";
  public _prefix = "daily-test/";

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

(async () => {
  const _s3 = getS3Helper();
  const directories = await _s3.listDirectories();
  console.log({ directories });

  // Loop each directory and enter it, each folder within the directory is in the format `YYYY-MM-DD`, if the folder name is older than one year, delete that folder
  const oneYearAgo = new Date(
    new Date().setFullYear(new Date().getFullYear() - 1)
  );
  console.log({ oneYearAgo });

  for (let index = 0; index < directories.length; index++) {
    const directory = directories[index];
    console.log({ directory });

    const params: ListObjectsV2CommandInput = {
      Bucket: _s3["_bucketName"],
      Prefix: directory,
      Delimiter: "/",
    };

    const data: ListObjectsV2Output = await _s3["_s3Client"].send(
      new ListObjectsV2Command(params)
    );
    console.log({ data });

    const folders = data.CommonPrefixes?.map((prefix) => prefix.Prefix) || [];
    console.log({ folders });

    for (let index = 0; index < folders.length; index++) {
      const folder = folders[index];
      console.log({ folder });

      const folderName = folder!.replace(directory!, "").replace("/", "");
      console.log({ folderName });

      if (new Date(folderName) < oneYearAgo) {
        console.log("Deleting...", { folder });
        // delete the folder

        const deleteParams: DeleteObjectCommandInput = {
          Bucket: _s3["_bucketName"],
          Key: folder,
        };

        await _s3["_s3Client"].send(new DeleteObjectCommand(deleteParams));
      }
    }
  }
})();
