import { useState, useEffect, useRef, useCallback } from "react";
import type { RealSenseHandle } from "@/components/RealSenseCanvas";

const stopRecorderSafe = (recorder: MediaRecorder | null): Promise<void> => {
	return new Promise((resolve) => {
		if (!recorder || recorder.state === "inactive") {
			resolve();
			return;
		}
		recorder.onstop = () => resolve();
		recorder.stop();
	});
};

export interface RecordingOptions {
	folderName: string;
	mode: "FULL" | "SEGMENT";
	fileName?: string;
}

function useCameraUnit(defaultDeviceId = "") {
	const [deviceId, setDeviceId] = useState(defaultDeviceId);
	const [isReady, setReady] = useState(false);

	const videoRef = useRef<HTMLVideoElement | null>(null);
	const recorderRef = useRef<MediaRecorder | null>(null);
	const chunksRef = useRef<Blob[]>([]);
	const streamRef = useRef<MediaStream | null>(null);

	useEffect(() => {
		if (
			videoRef.current &&
			streamRef.current &&
			videoRef.current.srcObject !== streamRef.current
		) {
			videoRef.current.srcObject = streamRef.current;
		}
	});

	return {
		deviceId,
		setDeviceId,
		isReady,
		setReady,
		videoRef,
		recorderRef,
		chunksRef,
		streamRef,
	};
}

export function useCameraSetup() {
	const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
	const [isRecording, setIsRecording] = useState(false);

	const main = useCameraUnit("");
	const sec = useCameraUnit("ws-realsense");
	const realSenseRef = useRef<RealSenseHandle | null>(null);

	useEffect(() => {
		const getDevices = async () => {
			try {
				await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
				const devices = await navigator.mediaDevices.enumerateDevices();
				const cameras = devices.filter((d) => d.kind === "videoinput");
				setVideoDevices(cameras);
				if (cameras.length > 0) main.setDeviceId(cameras[0].deviceId);
			} catch (err) {
				console.error(err);
			}
		};
		getDevices();
	}, []);

	useEffect(() => {
		if (!main.deviceId) return;
		const startMain = async () => {
			if (main.streamRef.current) {
				main.streamRef.current.getTracks().forEach((t) => t.stop());
			}
			try {
				const stream = await navigator.mediaDevices.getUserMedia({
					video: {
						deviceId: { exact: main.deviceId },
						width: { ideal: 640 },
						height: { ideal: 480 },
					},
					audio: true,
				});

				main.streamRef.current = stream;
				if (main.videoRef.current) main.videoRef.current.srcObject = stream;

				const mediaRecorder = new MediaRecorder(stream);
				main.chunksRef.current = [];
				mediaRecorder.ondataavailable = (event) => {
					if (event.data.size > 0) main.chunksRef.current.push(event.data);
				};
				main.recorderRef.current = mediaRecorder;
				main.setReady(true);
			} catch (err) {
				console.error(err);
			}
		};
		startMain();
		return () => main.streamRef.current?.getTracks().forEach((t) => t.stop());
	}, [main.deviceId]);

	useEffect(() => {
		if (sec.deviceId === "ws-realsense") return;

		if (!sec.deviceId) {
			if (sec.streamRef.current) {
				sec.streamRef.current.getTracks().forEach((t) => t.stop());
			}
			return;
		}

		const startSec = async () => {
			try {
				const stream = await navigator.mediaDevices.getUserMedia({
					video: {
						deviceId: { exact: sec.deviceId },
						width: { ideal: 640 },
						height: { ideal: 480 },
					},
					audio: false,
				});
				sec.streamRef.current = stream;
				if (sec.videoRef.current) sec.videoRef.current.srcObject = stream;

				const mediaRecorder = new MediaRecorder(stream, {
					mimeType: "video/webm",
				});
				sec.chunksRef.current = [];
				mediaRecorder.ondataavailable = (event) => {
					if (event.data.size > 0) sec.chunksRef.current.push(event.data);
				};
				sec.recorderRef.current = mediaRecorder;
				sec.setReady(true);
			} catch (err) {
				console.error(err);
			}
		};
		startSec();
		return () => sec.streamRef.current?.getTracks().forEach((t) => t.stop());
	}, [sec.deviceId]);

	const startRecording = useCallback(
		(options: RecordingOptions) => {
			if (
				main.recorderRef.current &&
				main.recorderRef.current.state === "inactive"
			) {
				main.chunksRef.current = [];
				main.recorderRef.current.start(1000);
			}

			if (sec.deviceId === "ws-realsense") {
				realSenseRef.current?.startRecording(options);
			} else if (
				sec.recorderRef.current &&
				sec.recorderRef.current.state === "inactive"
			) {
				sec.chunksRef.current = [];
				sec.recorderRef.current.start(1000);
			}

			setIsRecording(true);
		},
		[sec.deviceId],
	);

	const stopRecording = useCallback(async () => {
		await stopRecorderSafe(main.recorderRef.current);

		if (sec.deviceId === "ws-realsense") {
			realSenseRef.current?.stopRecording();
		} else {
			await stopRecorderSafe(sec.recorderRef.current);
		}

		setIsRecording(false);

		return {
			blobMain: new Blob(main.chunksRef.current, { type: "video/webm" }),
			blobSec:
				sec.deviceId !== "ws-realsense"
					? new Blob(sec.chunksRef.current, { type: "video/webm" })
					: null,
		};
	}, [sec.deviceId]);

	const allReady =
		main.isReady &&
		(sec.deviceId === "ws-realsense" ? sec.isReady : sec.isReady);

	return {
		videoDevices,
		isRecording,
		allReady,
		startRecording,
		stopRecording,

		deviceIdMain: main.deviceId,
		setDeviceIdMain: main.setDeviceId,
		videoRefMain: main.videoRef,

		deviceIdSec: sec.deviceId,
		setDeviceIdSec: sec.setDeviceId,
		videoRefSec: sec.videoRef,
		secReady: sec.isReady,
		setSecReady: sec.setReady,

		realSenseRef,
	};
}
