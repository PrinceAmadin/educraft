import { z } from "zod";
import { DataRequirement, ProjectType, ReferencingStyle } from "@prisma/client";
import { phoneSchema } from "@/lib/validations/clients";

const projectTypeValues = Object.values(ProjectType) as [ProjectType, ...ProjectType[]];
const referencingValues = Object.values(ReferencingStyle) as [ReferencingStyle, ...ReferencingStyle[]];
const dataValues = Object.values(DataRequirement) as [DataRequirement, ...DataRequirement[]];

const text = z.string().trim().max(1000).optional().or(z.literal(""));
const longText = z.string().trim().max(6000).optional().or(z.literal(""));

const optionalPositiveInt = (max: number) =>
  z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().positive().max(max).optional()
  );

/**
 * Public intake submission. One flat shape; `template` drives a superRefine
 * that enforces the fields each form actually requires. All conditional
 * academic fields stay optional at the type level.
 */
export const intakeSubmitSchema = z
  .object({
    template: z.enum(["academic_fyp", "academic_termpaper", "academic_seminar"]),
    serviceCode: z.string().min(1),

    // Personal
    fullName: z.string().trim().min(2, "Enter your full name").max(120),
    phone: phoneSchema,
    email: z.string().trim().email("Enter a valid email").max(160).optional().or(z.literal("")),
    universityId: z.string().min(1, "Select your university"),
    faculty: text,
    department: z.string().trim().min(2, "Enter your department").max(120),
    level: z.string().trim().max(40).optional().or(z.literal("")),
    matricNumber: text,
    referralCode: z.string().trim().max(40).optional().or(z.literal("")),

    // Project / topic
    projectTitle: z.string().trim().min(3, "Enter your project topic").max(300),
    supervisorName: text,
    hodName: text,
    projectType: z.enum(projectTypeValues).optional().or(z.literal("")),
    chapterCount: optionalPositiveInt(20),
    referencingStyle: z.enum(referencingValues).optional().or(z.literal("")),
    dataRequirements: z.enum(dataValues).optional().or(z.literal("")),
    minimumPages: text,

    // Term paper
    courseTitle: text,
    courseCode: text,
    wordCount: optionalPositiveInt(200_000),
    lecturerInstructions: longText,

    // Requirements
    departmentOutline: longText,
    proposalNotes: longText,
    specialInstructions: longText,
    clientDeadline: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date")
      .optional()
      .or(z.literal("")),
    isExpressDelivery: z.boolean().default(false),

    // Preliminary pages (FYP)
    dedicationType: z.enum(["God", "Family", "Both", "Custom", ""]).optional(),
    dedicationDetails: longText,
    acknowledgmentDetails: longText,

    agreeTerms: z.literal(true, {
      errorMap: () => ({ message: "Please accept the terms to continue" }),
    }),
  })
  .superRefine((v, ctx) => {
    const need = (field: string, cond: boolean, message: string) => {
      if (cond) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
    };

    if (v.template === "academic_termpaper") {
      need("courseTitle", !v.courseTitle, "Enter the course title");
    }
  });

export type IntakeSubmitInput = z.infer<typeof intakeSubmitSchema>;
