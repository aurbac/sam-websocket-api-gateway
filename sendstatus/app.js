// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const AWS = require('aws-sdk');

const ddb = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10' });

const { TABLE_NAME } = process.env;
const { TABLE_NAME_DEVICES } = process.env;

exports.handler = async (event, context) => {

  console.log(JSON.stringify(event, null, 2));

  let connectionData;
  
  const postData = JSON.parse(event.body).data.split(",");

  let statusData;
  try {
    statusData = await ddb.query({ TableName: TABLE_NAME_DEVICES, ConsistentRead: true, KeyConditionExpression: 'deviceId = :deviceId', ExpressionAttributeValues: { ':deviceId': postData[0] }  }).promise();    
  } catch (e) {
    console.log(e);
    console.log("Error 1");
    return { statusCode: 500, body: e.stack };
  }

  console.log(JSON.stringify(statusData, null, 2));

  var status_value = statusData.Items[0].status;

  if (postData[1]=="switch" && statusData.Items[0].updated_at<=(Date.now()-2000)){

    if (statusData.Items[0].status){
      status_value = false;
    }else{
      status_value = true;
    }

    try {
      /*
      // Call your IoT device here
      var iotdata = new AWS.IotData({
        endpoint: 'XXXXXXXXXXXX-ats.iot.us-east-1.amazonaws.com',
        apiVersion: '2015-05-28'
      });
      await iotdata.publish({ topic: "Lamp", qos:0, payload: "Lamp" }).promise();
      */
      var dynamodb = new AWS.DynamoDB();
      await dynamodb.updateItem({ TableName: TABLE_NAME_DEVICES, ExpressionAttributeNames: { "#status" : "status", "#updated_at" : "updated_at"}, ExpressionAttributeValues: { ':status': { "BOOL": status_value }, ':updated_at' : { 'N' : Date.now().toString() } }, Key: { "deviceId" : { "S" : postData[0] } } ,  UpdateExpression: "SET #status = :status, #updated_at = :updated_at" }).promise();
    } catch (e) {
      console.log(e);
      console.log("Error 1");
      return { statusCode: 500, body: e.stack };
    }
  }
  
  try {
    connectionData = await ddb.scan({ TableName: TABLE_NAME, ProjectionExpression: 'connectionId' }).promise();
  } catch (e) {
    return { statusCode: 500, body: e.stack };
  }
  
  const apigwManagementApi = new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: event.requestContext.domainName + '/' + event.requestContext.stage
  });
  
  const postCalls = connectionData.Items.map(async ({ connectionId }) => {
    try {
      if (event.requestContext.connectionId==connectionId)
        await apigwManagementApi.postToConnection({ ConnectionId: connectionId, Data: status_value.toString() }).promise();
    } catch (e) {
      if (e.statusCode === 410) {
        console.log(`Found stale connection, deleting ${connectionId}`);
        await ddb.delete({ TableName: TABLE_NAME, Key: { connectionId } }).promise();
      } else {
        throw e;
      }
    }
  });
  
  try {
    await Promise.all(postCalls);
  } catch (e) {
    return { statusCode: 500, body: e.stack };
  }

  return { statusCode: 200, body: 'Data sent.' };
};
