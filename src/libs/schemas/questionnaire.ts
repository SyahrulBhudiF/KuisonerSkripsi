import z from "zod";

export const submissionSchema = z.object({
  userName: z.string().min(1),
  userClass: z.string().min(1),
  questionnaireId: z.uuid(),
  videoBase64Main: z.string().min(1),
  videoBase64Secondary: z.string(),
  answers: z.record(z.string(), z.string()),
});

export type submission = z.infer<typeof submissionSchema>;
