"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArrays = (this && this.__spreadArrays) || function () {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
};
exports.__esModule = true;
var client_cloudwatch_logs_1 = require("@aws-sdk/client-cloudwatch-logs");
var config = {
    apiVersion: "2014-03-28",
    region: "eu-west-2"
};
var limit = 50;
var client = new client_cloudwatch_logs_1.CloudWatchLogsClient(config);
var total = [];
var logGroups = [];
var numWeeks = 6;
var now = new Date();
var sixWeeksAgo = now.setDate(now.getDate() - numWeeks * 7);
var timeout = function (ms) { return new Promise(function (resolve) { return setTimeout(resolve, ms); }); };
/**
 * Get a list of all log groups
 * @param nextToken
 * @returns
 */
var getLogGroups = function (nextToken) {
    if (nextToken === void 0) { nextToken = undefined; }
    return __awaiter(void 0, void 0, void 0, function () {
        var command, response, data;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    command = new client_cloudwatch_logs_1.DescribeLogGroupsCommand({ limit: limit, nextToken: nextToken });
                    return [4 /*yield*/, client.send(command)];
                case 1:
                    response = _b.sent();
                    console.log("token:", response.nextToken);
                    (_a = response.logGroups) === null || _a === void 0 ? void 0 : _a.map(function (logGroup) {
                        var _a;
                        if ((_a = logGroup.logGroupName) === null || _a === void 0 ? void 0 : _a.includes("preprod-"))
                            logGroups.push(logGroup.logGroupName);
                    });
                    if (response.logGroups && response.logGroups.length > 0)
                        total = __spreadArrays(total, response.logGroups);
                    _b.label = 2;
                case 2:
                    if (!(response.nextToken !== undefined)) return [3 /*break*/, 4];
                    return [4 /*yield*/, timeout(250).then(function () { return __awaiter(void 0, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, getLogGroups(response.nextToken)];
                                    case 1:
                                        data = _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 3:
                    _b.sent();
                    return [2 /*return*/, data];
                case 4: return [2 /*return*/];
            }
        });
    });
};
/**
 * Initialise a log group stream export to S3
 * @param logGroupName
 */
var exportLogGroupStream = function (logGroupName) { return __awaiter(void 0, void 0, void 0, function () {
    var params;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, timeout(1000)];
            case 1:
                _a.sent();
                params = {
                    destination: "clearabee-cloudwatch-logs",
                    from: sixWeeksAgo,
                    //from: 1577836800000, // 1st Jan 2020
                    //from: 1609459200000, // 1st Jan 2021
                    logGroupName: logGroupName,
                    to: new Date().getTime(),
                    destinationPrefix: "exportedLogs"
                };
                // const command = new CreateExportTaskCommand(params);
                // const response = await client.send(command);
                //console.log("log stream export result: ", { response });
                console.log({ logGroupName: logGroupName }, { params: params });
                return [2 /*return*/];
        }
    });
}); };
/**
 * Get all streams for a log group
 * @param logGroupName
 * @param nextToken
 * @returns
 */
var deleteLogGroupStreams = function (logGroupName, nextToken) { return __awaiter(void 0, void 0, void 0, function () {
    var command, response, arr, _loop_1, i, data;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                command = new client_cloudwatch_logs_1.DescribeLogStreamsCommand({
                    logGroupName: logGroupName,
                    nextToken: nextToken
                });
                return [4 /*yield*/, client.send(command)];
            case 1:
                response = _a.sent();
                arr = response.logStreams || [];
                if (!(arr.length > 0)) return [3 /*break*/, 5];
                _loop_1 = function (i) {
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                if (!(arr[i] !== undefined && arr[i].hasOwnProperty("lastEventTimestamp"))) return [3 /*break*/, 2];
                                if (!(arr[i].lastEventTimestamp < sixWeeksAgo)) return [3 /*break*/, 2];
                                return [4 /*yield*/, timeout(250).then(function () { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, deleteLogStream(logGroupName, arr[i].logStreamName)];
                                            case 1: return [2 /*return*/, _a.sent()];
                                        }
                                    }); }); })];
                            case 1:
                                _a.sent();
                                _a.label = 2;
                            case 2: return [2 /*return*/];
                        }
                    });
                };
                i = 0;
                _a.label = 2;
            case 2:
                if (!(i <= arr.length)) return [3 /*break*/, 5];
                return [5 /*yield**/, _loop_1(i)];
            case 3:
                _a.sent();
                _a.label = 4;
            case 4:
                i++;
                return [3 /*break*/, 2];
            case 5:
                if (!(response.nextToken !== undefined)) return [3 /*break*/, 7];
                console.log("awaiting 500... with token " + response.nextToken);
                return [4 /*yield*/, timeout(250).then(function () { return __awaiter(void 0, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    console.log("250 over, recursiving...");
                                    return [4 /*yield*/, deleteLogGroupStreams(logGroupName, response.nextToken)];
                                case 1:
                                    data = _a.sent();
                                    return [2 /*return*/];
                            }
                        });
                    }); })];
            case 6:
                _a.sent();
                return [2 /*return*/, data];
            case 7: return [2 /*return*/];
        }
    });
}); };
/**
 * Remove a log stream from a log group
 * @param logGroupName
 * @param logStreamName
 */
var deleteLogStream = function (logGroupName, logStreamName) { return __awaiter(void 0, void 0, void 0, function () {
    var command, deleteResult, error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                console.log("deleting logs for stream " + logStreamName + " in log group " + logGroupName);
                command = new client_cloudwatch_logs_1.DeleteLogStreamCommand({
                    logGroupName: logGroupName,
                    logStreamName: logStreamName
                });
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, client.send(command)];
            case 2:
                deleteResult = _a.sent();
                console.log({ deleteResult: deleteResult });
                return [2 /*return*/, deleteResult];
            case 3:
                error_1 = _a.sent();
                console.log({ error: error_1 });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); };
var deleteStreams = function () { return __awaiter(void 0, void 0, void 0, function () {
    var i, _loop_2, i_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                console.log("logGroups length: " + logGroups.length);
                i = logGroups.length;
                _loop_2 = function (i_1) {
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0: return [4 /*yield*/, timeout(250).then(function () { return __awaiter(void 0, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0:
                                                console.log("deleting streams for " + logGroups[i_1]);
                                                return [4 /*yield*/, deleteLogGroupStreams(logGroups[i_1])];
                                            case 1:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })];
                            case 1:
                                _a.sent();
                                return [2 /*return*/];
                        }
                    });
                };
                i_1 = 0;
                _a.label = 1;
            case 1:
                if (!(i_1 <= logGroups.length)) return [3 /*break*/, 4];
                return [5 /*yield**/, _loop_2(i_1)];
            case 2:
                _a.sent();
                _a.label = 3;
            case 3:
                i_1++;
                return [3 /*break*/, 1];
            case 4: return [2 /*return*/];
        }
    });
}); };
var exportStreams = function () { return __awaiter(void 0, void 0, void 0, function () {
    var i, _loop_3, i_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                console.log("logGroups length: " + logGroups.length);
                i = logGroups.length;
                _loop_3 = function (i_2) {
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0: return [4 /*yield*/, timeout(250).then(function () { return __awaiter(void 0, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0:
                                                console.log("exporting streams for " + logGroups[i_2]);
                                                return [4 /*yield*/, exportLogGroupStream(logGroups[i_2])];
                                            case 1:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })];
                            case 1:
                                _a.sent();
                                return [2 /*return*/];
                        }
                    });
                };
                i_2 = 0;
                _a.label = 1;
            case 1:
                if (!(i_2 <= logGroups.length)) return [3 /*break*/, 4];
                return [5 /*yield**/, _loop_3(i_2)];
            case 2:
                _a.sent();
                _a.label = 3;
            case 3:
                i_2++;
                return [3 /*break*/, 1];
            case 4: return [2 /*return*/];
        }
    });
}); };
var start = new Date().getSeconds();
(function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, getLogGroups().then(function (d) { return __awaiter(void 0, void 0, void 0, function () {
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0: return [4 /*yield*/, deleteStreams().then(function () {
                                    var end = new Date().getSeconds();
                                    console.log("completed in: " + (end - start) + " seconds");
                                    console.log("total records fetched: " + total.length);
                                })];
                            case 1:
                                _a.sent();
                                return [2 /*return*/];
                        }
                    });
                }); })];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); })();
