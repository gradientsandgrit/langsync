import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

import { config } from "dotenv";
config();

const langsyncUser = new aws.iam.User(`langsync-${pulumi.getStack()}`, {});

const awsAccountId = process.env.AWS_ACCOUNT_ID;
const mailDomain = process.env.LANGSYNC_MAIL_DOMAIN;
if (!awsAccountId) {
  throw new Error("AWS_ACCOUNT_ID is not set");
}

if (!mailDomain) {
  throw new Error("LANGSYNC_MAIL_DOMAIN is not set");
}

new aws.iam.UserPolicy(`langsync-${pulumi.getStack()}-ses-send-mail-policy`, {
  user: langsyncUser.name,
  policy: pulumi.interpolate`{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "VisualEditor0",
            "Effect": "Allow",
            "Action": "ses:*",
            "Resource": [
                "arn:aws:ses:eu-central-1:${awsAccountId}:identity/${mailDomain}",
                "arn:aws:ses:*:${awsAccountId}:template/*",
                "arn:aws:ses:*:${awsAccountId}:configuration-set/*"
            ]
        }
    ]
}`,
});

const workerIndexDLQ = new aws.sqs.Queue(
  `langsync-${pulumi.getStack()}-worker-index-dlq`,
  {},
);

const indexQueue = new aws.sqs.Queue(
  `langsync-${pulumi.getStack()}-worker-index`,
  {
    redrivePolicy: pulumi.interpolate`{
    "maxReceiveCount": 3,
    "deadLetterTargetArn": "${workerIndexDLQ.arn}"
  }`,
  },
);

new aws.iam.UserPolicy(`langsync-${pulumi.getStack()}-queue-access`, {
  user: langsyncUser.name,
  policy: pulumi.interpolate`{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "sqs:DeleteMessage",
                "sqs:ReceiveMessage",
                "sqs:SendMessage",
                "sqs:ChangeMessageVisibility"
            ],
            "Resource": "${indexQueue.arn}"
        }
    ]
}`,
});

const accessKey = new aws.iam.AccessKey(
  `langsync-${pulumi.getStack()}-access-key`,
  {
    user: langsyncUser.name,
  },
);

export const accessKeyId = accessKey.id;
export const secretAccessKey = accessKey.secret;
export const indexQueueUrl = indexQueue.id;

export const indexQueueArn = indexQueue.arn;
export const indexQueueDLQArn = workerIndexDLQ.arn;
