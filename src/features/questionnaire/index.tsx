import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useLoaderData, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { submitQuestionnaire } from "@/apis/questionnaire";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useUserStore } from "@/libs/store/UserStore";

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export function QuestionnairePage() {
  const { questionnaire, questions } = useLoaderData({
    from: "/questionnaire/",
  });
  const user = useUserStore().user;
  const navigate = useNavigate();

  const [isRecording, setIsRecording] = useState(false);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceIdMain, setDeviceIdMain] = useState<string>("");
  const [deviceIdSec, setDeviceIdSec] = useState<string>("");

  const videoRefMain = useRef<HTMLVideoElement>(null);
  const mediaRecorderRefMain = useRef<MediaRecorder | null>(null);
  const videoChunksRefMain = useRef<Blob[]>([]);
  const streamRefMain = useRef<MediaStream | null>(null);

  const videoRefSec = useRef<HTMLVideoElement>(null);
  const mediaRecorderRefSec = useRef<MediaRecorder | null>(null);
  const videoChunksRefSec = useRef<Blob[]>([]);
  const streamRefSec = useRef<MediaStream | null>(null);

  const mutation = useMutation({
    mutationFn: submitQuestionnaire,
    onSuccess: () => navigate({ to: "/success" }),
    onError: (error) => {
      console.error(error);
      alert("Failed to submit. Please try again.");
    },
  });

  const form = useForm({
    defaultValues: {
      answers: {} as Record<string, string>,
    },
    onSubmit: async ({ value }) => {
      if (!user?.name || !user?.class) {
        alert("User profile missing");
        return;
      }

      if (
        mediaRecorderRefMain.current &&
        mediaRecorderRefMain.current.state !== "inactive"
      ) {
        mediaRecorderRefMain.current.stop();
      }

      if (
        mediaRecorderRefSec.current &&
        mediaRecorderRefSec.current.state !== "inactive"
      ) {
        mediaRecorderRefSec.current.stop();
      }

      await new Promise((r) => setTimeout(r, 1000));

      let base64Main = "";
      if (videoChunksRefMain.current.length > 0) {
        const videoBlobMain = new Blob(videoChunksRefMain.current, {
          type: "video/webm",
        });
        base64Main = await blobToBase64(videoBlobMain);
      }

      let base64Sec = "";
      if (videoChunksRefSec.current.length > 0) {
        const videoBlobSec = new Blob(videoChunksRefSec.current, {
          type: "video/webm",
        });
        base64Sec = await blobToBase64(videoBlobSec);
      }

      await mutation.mutateAsync({
        data: {
          userName: user.name,
          userClass: user.class,
          questionnaireId: questionnaire.id,
          videoBase64Main: base64Main,
          videoBase64Secondary: base64Sec || " ",
          answers: value.answers,
        },
      });
    },
  });

  useEffect(() => {
    const getDevices = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = devices.filter((d) => d.kind === "videoinput");
        setVideoDevices(cameras);

        if (cameras.length > 0) {
          setDeviceIdMain(cameras[0].deviceId);

          const realSense = cameras.find(
            (c) =>
              c.label.toLowerCase().includes("realsense") ||
              c.label.toLowerCase().includes("rgb"),
          );
          const otherCam = cameras.find(
            (c) => c.deviceId !== cameras[0].deviceId,
          );

          if (realSense) {
            setDeviceIdSec(realSense.deviceId);
          } else if (otherCam) {
            setDeviceIdSec(otherCam.deviceId);
          }
        }
      } catch (err) {
        console.error("Media device error", err);
      }
    };

    getDevices();
  }, []);

  useEffect(() => {
    if (!deviceIdMain) return;

    const startMain = async () => {
      if (streamRefMain.current) {
        streamRefMain.current.getTracks().forEach((t) => t.stop());
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: deviceIdMain },
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: true,
        });

        streamRefMain.current = stream;
        if (videoRefMain.current) {
          videoRefMain.current.srcObject = stream;
        }

        const mediaRecorder = new MediaRecorder(stream);
        videoChunksRefMain.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            videoChunksRefMain.current.push(event.data);
          }
        };

        mediaRecorder.start();
        mediaRecorderRefMain.current = mediaRecorder;
      } catch (err) {
        console.error("Main camera error", err);
      }
    };

    startMain();

    return () => {
      streamRefMain.current?.getTracks().forEach((track) => track.stop());
    };
  }, [deviceIdMain]);

  useEffect(() => {
    if (!deviceIdSec) {
      if (streamRefSec.current) {
        streamRefSec.current.getTracks().forEach((t) => t.stop());
      }
      if (videoRefSec.current) {
        videoRefSec.current.srcObject = null;
      }
      setIsRecording(false);
      return;
    }

    const startSec = async () => {
      if (streamRefSec.current) {
        streamRefSec.current.getTracks().forEach((t) => t.stop());
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: deviceIdSec },
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });

        streamRefSec.current = stream;
        if (videoRefSec.current) {
          videoRefSec.current.srcObject = stream;
        }

        const mediaRecorder = new MediaRecorder(stream);
        videoChunksRefSec.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            videoChunksRefSec.current.push(event.data);
          }
        };

        mediaRecorder.start();
        mediaRecorderRefSec.current = mediaRecorder;
        setIsRecording(true);
      } catch (err) {
        console.error("Secondary camera error", err);
      }
    };

    startSec();

    return () => {
      streamRefSec.current?.getTracks().forEach((track) => track.stop());
    };
  }, [deviceIdSec]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-48">
      <div className="max-w-3xl mx-auto mb-6">
        <h1 className="text-2xl font-bold">{questionnaire.title}</h1>
        <p className="text-slate-600">
          Student:{" "}
          <span className="font-semibold">{user?.name || "Guest"}</span> |
          Class: <span className="font-semibold">{user?.class || "-"}</span>
        </p>
      </div>

      <div className="max-w-3xl mx-auto space-y-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
        >
          {questions?.map((q, index) => (
            <Card key={q.id} className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg">
                  {index + 1}. {q.question_text}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form.Field name={`answers.${q.id}`}>
                  {(field) => (
                    <RadioGroup
                      onValueChange={(val) => field.handleChange(val)}
                      value={field.state.value}
                    >
                      {q.answers.map((ans) => (
                        <div
                          key={ans.id}
                          className="flex items-center space-x-2"
                        >
                          <RadioGroupItem value={ans.id} id={ans.id} />
                          <Label htmlFor={ans.id}>{ans.answer_text}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  )}
                </form.Field>
              </CardContent>
            </Card>
          ))}

          <form.Subscribe
            selector={(state) => ({
              answers: state.values.answers,
              isSubmitting: state.isSubmitting,
            })}
          >
            {({ answers, isSubmitting }) => (
              <Button
                className="w-full mt-8"
                size="lg"
                type="submit"
                disabled={
                  !questions ||
                  Object.keys(answers).length !== questions.length ||
                  isSubmitting ||
                  mutation.isPending
                }
              >
                {isSubmitting || mutation.isPending
                  ? "Uploading Videos..."
                  : "Submit Answers"}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </div>

      <div className="fixed bottom-4 right-4 flex flex-row gap-4 z-50 items-end">
        <div className="flex flex-col gap-2">
          <div className="bg-white/90 backdrop-blur px-2 py-1 rounded shadow text-[10px] font-bold text-center border border-slate-200">
            Main Cam (Audio ON)
          </div>
          <select
            className="w-48 text-xs bg-white border border-slate-300 rounded p-1 shadow-sm"
            value={deviceIdMain}
            onChange={(e) => setDeviceIdMain(e.target.value)}
          >
            {videoDevices.map((d) => (
              <option key={`main-${d.deviceId}`} value={d.deviceId}>
                {d.label || `Cam ${d.deviceId.substring(0, 5)}...`}
              </option>
            ))}
          </select>
          <div className="w-48 h-36 bg-black rounded-lg overflow-hidden border-2 border-slate-300 shadow-xl">
            <video
              ref={videoRefMain}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="bg-blue-100/90 backdrop-blur px-2 py-1 rounded shadow text-[10px] font-bold text-center text-blue-700 border border-blue-200">
            Secondary / D415 (Video Only)
          </div>
          <select
            className="w-48 text-xs bg-white border border-blue-300 rounded p-1 shadow-sm"
            value={deviceIdSec}
            onChange={(e) => setDeviceIdSec(e.target.value)}
          >
            <option value="">-- Turn Off --</option>
            {videoDevices.map((d) => (
              <option key={`sec-${d.deviceId}`} value={d.deviceId}>
                {d.label || `Cam ${d.deviceId.substring(0, 5)}...`}
              </option>
            ))}
          </select>
          <div className="w-48 h-36 bg-black rounded-lg overflow-hidden border-2 border-blue-500 shadow-xl relative group">
            <video
              ref={videoRefSec}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />

            <div
              className={`absolute top-2 left-2 px-2 py-0.5 bg-red-600 text-white text-[10px] font-bold rounded-full transition-opacity ${isRecording ? "opacity-100 animate-pulse" : "opacity-0"}`}
            >
              REC
            </div>

            {!deviceIdSec && (
              <div className="absolute inset-0 flex items-center justify-center text-white/50 text-xs">
                No Signal
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
