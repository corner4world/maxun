import { readFile, readFiles } from "../workflow-management/storage";
import { Router, Request, Response } from 'express';
import { chromium } from "playwright";
import { requireAPIKey } from "../middlewares/api";
import Robot from "../models/Robot";
import Run from "../models/Run";
const router = Router();
import { getDecryptedProxyConfig } from "../routes/proxy";
import { uuid } from "uuidv4";
import { createRemoteBrowserForRun, destroyRemoteBrowser } from "../browser-management/controller";
import logger from "../logger";
import { browserPool } from "../server";
import { io, Socket } from "socket.io-client";
import { BinaryOutputService } from "../storage/mino";
import { AuthenticatedRequest } from "../routes/record"
import {capture} from "../utils/analytics";

const formatRecording = (recordingData: any) => {
    const recordingMeta = recordingData.recording_meta;
    const workflow = recordingData.recording.workflow || [];
    const firstWorkflowStep = workflow[0]?.where?.url || '';

    const inputParameters = [
        {
            type: "string",
            name: "originUrl",
            label: "Origin URL",
            required: true,
            defaultValue: firstWorkflowStep,
        },
    ];

    return {
        id: recordingMeta.id,
        name: recordingMeta.name,
        createdAt: new Date(recordingMeta.createdAt).getTime(),
        inputParameters,
    };
};

/**
 * @swagger
 * /api/robots:
 *   get:
 *     summary: Get all robots
 *     description: Retrieve a list of all robots.
 *     security:
 *       - api_key: []
 *     responses:
 *       200:
 *         description: A list of robots.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 messageCode:
 *                   type: string
 *                   example: success
 *                 robots:
 *                   type: object
 *                   properties:
 *                     totalCount:
 *                       type: integer
 *                       example: 5
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             example: "12345"
 *                           name:
 *                             type: string
 *                             example: "Sample Robot"
 *       500:
 *         description: Error retrieving robots.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 500
 *                 messageCode:
 *                   type: string
 *                   example: error
 *                 message:
 *                   type: string
 *                   example: "Failed to retrieve robots"
 */
router.get("/robots", requireAPIKey, async (req: Request, res: Response) => {
    try {
        const robots = await Robot.findAll({ raw: true });
        const formattedRecordings = robots.map(formatRecording);

        const response = {
            statusCode: 200,
            messageCode: "success",
            robots: {
                totalCount: formattedRecordings.length,
                items: formattedRecordings,
            },
        };

        res.status(200).json(response);
    } catch (error) {
        console.error("Error fetching robots:", error);
        res.status(500).json({
            statusCode: 500,
            messageCode: "error",
            message: "Failed to retrieve robots",
        });
    }
});


const formatRecordingById = (recordingData: any) => {
    const recordingMeta = recordingData.recording_meta;
    const workflow = recordingData.recording.workflow || [];
    const firstWorkflowStep = workflow[0]?.where?.url || '';

    const inputParameters = [
        {
            type: "string",
            name: "originUrl",
            label: "Origin URL",
            required: true,
            defaultValue: firstWorkflowStep,
        },
    ];

    return {
        id: recordingMeta.id,
        name: recordingMeta.name,
        createdAt: new Date(recordingMeta.createdAt).getTime(),
        inputParameters,
    };
};

/**
 * @swagger
 * /api/robots/{id}:
 *   get:
 *     summary: Get robot by ID
 *     description: Retrieve a robot by its ID.
 *     security:
 *       - api_key: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the robot to retrieve.
 *     responses:
 *       200:
 *         description: Robot details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 messageCode:
 *                   type: string
 *                   example: success
 *                 robot:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "12345"
 *                     name:
 *                       type: string
 *                       example: "Sample Robot"
 *       404:
 *         description: Robot not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 404
 *                 messageCode:
 *                   type: string
 *                   example: not_found
 *                 message:
 *                   type: string
 *                   example: "Recording with ID not found."
 */
router.get("/robots/:id", requireAPIKey, async (req: Request, res: Response) => {
    try {
        const robot = await Robot.findOne({
            where: {
                'recording_meta.id': req.params.id
            },
            raw: true
        });

        const formattedRecording = formatRecordingById(robot);

        const response = {
            statusCode: 200,
            messageCode: "success",
            robot: formattedRecording,
        };

        res.status(200).json(response);
    } catch (error) {
        console.error("Error fetching robot:", error);
        res.status(404).json({
            statusCode: 404,
            messageCode: "not_found",
            message: `Robot with ID "${req.params.id}" not found.`,
        });
    }
});

/**
 * @swagger
 * /api/robots/{id}/runs:
 *   get:
 *     summary: Get all runs for a robot
 *     description: Retrieve all runs associated with a specific robot.
 *     security:
 *       - api_key: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the robot.
 *     responses:
 *       200:
 *         description: A list of runs for the robot.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 messageCode:
 *                   type: string
 *                   example: success
 *                 runs:
 *                   type: object
 *                   properties:
 *                     totalCount:
 *                       type: integer
 *                       example: 5
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           runId:
 *                             type: string
 *                             example: "67890"
 *                           status:
 *                             type: string
 *                             example: "completed"
 *       500:
 *         description: Error retrieving runs.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 500
 *                 messageCode:
 *                   type: string
 *                   example: error
 *                 message:
 *                   type: string
 *                   example: "Failed to retrieve runs"
 */
router.get("/robots/:id/runs", requireAPIKey, async (req: Request, res: Response) => {
    try {
        const runs = await Run.findAll({
            where: {
                robotMetaId: req.params.id
            },
            raw: true
        });

        const response = {
            statusCode: 200,
            messageCode: "success",
            runs: {
                totalCount: runs.length,
                items: runs,
            },
        };

        res.status(200).json(response);
    } catch (error) {
        console.error("Error fetching runs:", error);
        res.status(500).json({
            statusCode: 500,
            messageCode: "error",
            message: "Failed to retrieve runs",
        });
    }
}
);

/**
 * @swagger
 * /api/robots/{id}/runs/{runId}:
 *   get:
 *     summary: Get a specific run by ID for a robot
 *     description: Retrieve details of a specific run by its ID.
 *     security:
 *       - api_key: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the robot.
 *       - in: path
 *         name: runId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the run.
 *     responses:
 *       200:
 *         description: Run details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 messageCode:
 *                   type: string
 *                   example: success
 *                 run:
 *                   type: object
 *                   properties:
 *                     runId:
 *                       type: string
 *                       example: "67890"
 *                     status:
 *                       type: string
 *                       example: "completed"
 *       404:
 *         description: Run not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 404
 *                 messageCode:
 *                   type: string
 *                   example: not_found
 *                 message:
 *                   type: string
 *                   example: "Run with id not found."
 */
router.get("/robots/:id/runs/:runId", requireAPIKey, async (req: Request, res: Response) => {
    try {
        const run = await Run.findOne({
            where: {
                runId: req.params.runId,
                robotMetaId: req.params.id,
            },
            raw: true
        });

        const response = {
            statusCode: 200,
            messageCode: "success",
            run: run,
        };

        res.status(200).json(response);
    } catch (error) {
        console.error("Error fetching run:", error);
        res.status(404).json({
            statusCode: 404,
            messageCode: "not_found",
            message: `Run with id "${req.params.runId}" for robot with id "${req.params.id}" not found.`,
        });
    }
});

async function createWorkflowAndStoreMetadata(id: string, userId: string) {
    try {
        const recording = await Robot.findOne({
            where: {
                'recording_meta.id': id
            },
            raw: true
        });

        if (!recording || !recording.recording_meta || !recording.recording_meta.id) {
            return {
                success: false,
                error: 'Recording not found'
            };
        }

        const proxyConfig = await getDecryptedProxyConfig(userId);
        let proxyOptions: any = {};

        if (proxyConfig.proxy_url) {
            proxyOptions = {
                server: proxyConfig.proxy_url,
                ...(proxyConfig.proxy_username && proxyConfig.proxy_password && {
                    username: proxyConfig.proxy_username,
                    password: proxyConfig.proxy_password,
                }),
            };
        }

        const browserId = createRemoteBrowserForRun({
            browser: chromium,
            launchOptions: {
                headless: true,
                proxy: proxyOptions.server ? proxyOptions : undefined,
            }
        }, userId);

        const runId = uuid();

        const run = await Run.create({
            status: 'running',
            name: recording.recording_meta.name,
            robotId: recording.id,
            robotMetaId: recording.recording_meta.id,
            startedAt: new Date().toLocaleString(),
            finishedAt: '',
            browserId,
            interpreterSettings: { maxConcurrency: 1, maxRepeats: 1, debug: true },
            log: '',
            runId,
            runByAPI: true,
            serializableOutput: {},
            binaryOutput: {},
        });

        const plainRun = run.toJSON();

        return {
            browserId,
            runId: plainRun.runId,
        }

    } catch (e) {
        const { message } = e as Error;
        logger.log('info', `Error while scheduling a run with id: ${id}`);
        console.log(message);
        return {
            success: false,
            error: message,
        };
    }
}

async function readyForRunHandler(browserId: string, id: string) {
    try {
        const result = await executeRun(id);

        if (result && result.success) {
            logger.log('info', `Interpretation of ${id} succeeded`);
            resetRecordingState(browserId, id);
            return result.interpretationInfo;
        } else {
            logger.log('error', `Interpretation of ${id} failed`);
            await destroyRemoteBrowser(browserId);
            resetRecordingState(browserId, id);
            return null;
        }

    } catch (error: any) {
        logger.error(`Error during readyForRunHandler: ${error.message}`);
        await destroyRemoteBrowser(browserId);
        return null;
    }
}


function resetRecordingState(browserId: string, id: string) {
    browserId = '';
    id = '';
}

async function executeRun(id: string) {
    try {
        const run = await Run.findOne({ where: { runId: id } });
        if (!run) {
            return {
                success: false,
                error: 'Run not found'
            };
        }

        const plainRun = run.toJSON();

        const recording = await Robot.findOne({ where: { 'recording_meta.id': plainRun.robotMetaId }, raw: true });
        if (!recording) {
            return {
                success: false,
                error: 'Recording not found'
            };
        }

        plainRun.status = 'running';

        const browser = browserPool.getRemoteBrowser(plainRun.browserId);
        if (!browser) {
            throw new Error('Could not access browser');
        }

        const currentPage = await browser.getCurrentPage();
        if (!currentPage) {
            throw new Error('Could not create a new page');
        }

        const interpretationInfo = await browser.interpreter.InterpretRecording(
            recording.recording, currentPage, plainRun.interpreterSettings
        );

        const binaryOutputService = new BinaryOutputService('maxun-run-screenshots');
        const uploadedBinaryOutput = await binaryOutputService.uploadAndStoreBinaryOutput(run, interpretationInfo.binaryOutput);

        await destroyRemoteBrowser(plainRun.browserId);

        const updatedRun = await run.update({
            ...run,
            status: 'success',
            finishedAt: new Date().toLocaleString(),
            browserId: plainRun.browserId,
            log: interpretationInfo.log.join('\n'),
            serializableOutput: interpretationInfo.serializableOutput,
            binaryOutput: uploadedBinaryOutput,
        });

        let totalRowsExtracted = 0;
        updatedRun.dataValues.serializableOutput['item-0'].forEach((item: any) => {
            totalRowsExtracted += Object.keys(item).length;
        }
        );

        capture('maxun-oss-run-created-api',{
                runId: id,
                created_at: new Date().toISOString(),
                status: 'success',
                extractedItemsCount: updatedRun.dataValues.serializableOutput['item-0'].length,
                extractedRowsCount: totalRowsExtracted,
                extractedScreenshotsCount: updatedRun.dataValues.binaryOutput['item-0'].length,
            }
        )

        return {
            success: true,
            interpretationInfo: updatedRun.toJSON()
        };

    } catch (error: any) {
        logger.log('info', `Error while running a recording with id: ${id} - ${error.message}`);
        const run = await Run.findOne({ where: { runId: id } });
        if (run) {
            await run.update({
                status: 'failed',
                finishedAt: new Date().toLocaleString(),
            });
        }
        capture(
           'maxun-oss-run-created-api',
           {
                runId: id,
                created_at: new Date().toISOString(),
                status: 'failed',
            }
        );
        return {
            success: false,
            error: error.message,
        };
    }
}

export async function handleRunRecording(id: string, userId: string) {
    try {
        const result = await createWorkflowAndStoreMetadata(id, userId);
        const { browserId, runId: newRunId } = result;

        if (!browserId || !newRunId || !userId) {
            throw new Error('browserId or runId or userId is undefined');
        }

        const socket = io(`http://localhost:8080/${browserId}`, {
            transports: ['websocket'],
            rejectUnauthorized: false
        });

        socket.on('ready-for-run', () => readyForRunHandler(browserId, newRunId));

        logger.log('info', `Running recording: ${id}`);

        socket.on('disconnect', () => {
            cleanupSocketListeners(socket, browserId, newRunId);
        });

        // Return the runId immediately, so the client knows the run is started
        return newRunId;

    } catch (error: any) {
        logger.error('Error running recording:', error);
    }
}

function cleanupSocketListeners(socket: Socket, browserId: string, id: string) {
    socket.off('ready-for-run', () => readyForRunHandler(browserId, id));
    logger.log('info', `Cleaned up listeners for browserId: ${browserId}, runId: ${id}`);
}

async function waitForRunCompletion(runId: string, interval: number = 2000) {
    while (true) {
        const run = await Run.findOne({ where: { runId }, raw: true });
        if (!run) throw new Error('Run not found');

        if (run.status === 'success') {
            return run;
        } else if (run.status === 'failed') {
            throw new Error('Run failed');
        }

        // Wait for the next polling interval
        await new Promise(resolve => setTimeout(resolve, interval));
    }
}

/**
 * @swagger
 * /api/robots/{id}/runs:
 *   post:
 *     summary: Run a robot by ID
 *     description: When you need to run a robot and get its captured data, you can use this endpoint to create a run for the robot. For now, you can poll the GET endpoint to retrieve a run's details as soon as it is finished. We are working on adding a webhook feature to notify you when a run is finished.
 *     security:
 *       - api_key: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the robot to run.
 *     responses:
 *       200:
 *         description: Robot run started successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 messageCode:
 *                   type: string
 *                   example: success
 *                 run:
 *                   type: object
 *                   properties:
 *                     runId:
 *                       type: string
 *                       example: "67890"
 *                     status:
 *                       type: string
 *                       example: "in_progress"
 *       401:
 *         description: Unauthorized access.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Unauthorized"
 *       500:
 *         description: Error running robot.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 500
 *                 messageCode:
 *                   type: string
 *                   example: error
 *                 message:
 *                   type: string
 *                   example: "Failed to run robot"
 */
router.post("/robots/:id/runs", requireAPIKey, async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ ok: false, error: 'Unauthorized' });
        }
        const runId = await handleRunRecording(req.params.id, req.user.dataValues.id);
        console.log(`Result`, runId);

        if (!runId) {
            throw new Error('Run ID is undefined');
        }
        const completedRun = await waitForRunCompletion(runId);

        const response = {
            statusCode: 200,
            messageCode: "success",
            run: completedRun,
        };

        res.status(200).json(response);
    } catch (error) {
        console.error("Error running robot:", error);
        res.status(500).json({
            statusCode: 500,
            messageCode: "error",
            message: "Failed to run robot",
        });
    }
});


export default router;