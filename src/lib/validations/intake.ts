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

const educationEntry = z.object({
  degree: z.string().trim().max(160).optional().or(z.literal("")),
  school: z.string().trim().max(160).optional().or(z.literal("")),
  year: z.string().trim().max(40).optional().or(z.literal("")),
  cgpa: z.string().trim().max(20).optional().or(z.literal("")),
});

const experienceEntry = z.object({
  title: z.string().trim().max(160).optional().or(z.literal("")),
  company: z.string().trim().max(160).optional().or(z.literal("")),
  dates: z.string().trim().max(80).optional().or(z.literal("")),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
});

/**
 * A document the client attached on the form. Uploaded straight from the
 * browser to Vercel Blob, so only a Blob URL is ever accepted here, never an
 * arbitrary link.
 */
export const ATTACHMENT_CATEGORIES = ["from_client", "department_outline"] as const;
export const MAX_ATTACHMENTS = 10;
export const attachmentSchema = z.object({
  url: z
    .string()
    .url()
    .max(600)
    .refine((u) => {
      try {
        const { protocol, hostname } = new URL(u);
        return protocol === "https:" && hostname.endsWith(".blob.vercel-storage.com");
      } catch {
        return false;
      }
    }, "Invalid file link"),
  name: z.string().trim().min(1).max(200),
  size: z.number().int().nonnegative().max(60_000_000).optional(),
  type: z.string().trim().max(120).optional(),
  category: z.enum(ATTACHMENT_CATEGORIES).default("from_client"),
});
export type IntakeAttachment = z.infer<typeof attachmentSchema>;

export const INTAKE_TEMPLATES = [
  "academic_fyp",
  "academic_termpaper",
  "academic_seminar",
  "academic_it",
  "career_cv",
  "design_presentation",
  "editing",
] as const;

/**
 * Public intake submission. One flat shape; `template` drives a superRefine
 * that enforces the fields each form actually requires.
 */
export const intakeSubmitSchema = z
  .object({
    template: z.enum(INTAKE_TEMPLATES),
    serviceCode: z.string().min(1),
    /** Optional package of the service, e.g. "With Data Analysis". Blank = the base option. */
    serviceVariantId: z.string().trim().max(60).optional().or(z.literal("")),
    /** Documents the client attached (proposal, outline, existing work). */
    attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS).optional(),

    // Personal / contact
    fullName: z.string().trim().min(2, "Enter your full name").max(120),
    phone: phoneSchema,
    // Required: it is where the client's dashboard sign-in code is sent.
    email: z.string().trim().min(1, "Enter your email, we send your sign-in code there").email("Enter a valid email").max(160),
    linkedin: z.string().trim().max(200).optional().or(z.literal("")),
    address: z.string().trim().max(300).optional().or(z.literal("")),
    universityId: z.string().optional().or(z.literal("")),
    faculty: text,
    department: z.string().trim().max(120).optional().or(z.literal("")),
    level: z.string().trim().max(40).optional().or(z.literal("")),
    matricNumber: text,
    referralCode: z.string().trim().max(40).optional().or(z.literal("")),

    // Topic / project
    projectTitle: z.string().trim().max(300).optional().or(z.literal("")),
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

    // IT report
    companyName: text,
    companyAddress: text,
    itDuration: text,
    companyDepartment: text,
    companySupervisor: text,

    // CV / resume
    education: z.array(educationEntry).max(15).optional(),
    experience: z.array(experienceEntry).max(15).optional(),
    skills: z.array(z.string().trim().min(1).max(60)).max(40).optional(),
    certifications: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
    stylePreference: z.enum(["Modern", "Classic", "Creative", ""]).optional(),

    // Presentation
    purpose: text,
    audience: text,
    slideCount: optionalPositiveInt(300),
    contentSource: longText,
    colorScheme: text,
    designStyle: text,

    // Editing
    editingType: z.enum(["Editing", "Formatting", "Both", ""]).optional(),
    pageCount: optionalPositiveInt(5000),

    // Requirements / shared
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
    const require = (field: string, ok: boolean, message: string) => {
      if (!ok) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
    };

    // Every EduCraft client is tied to a university.
    require("universityId", Boolean(v.universityId), "Select your university");

    const academic = [
      "academic_fyp",
      "academic_termpaper",
      "academic_seminar",
      "academic_it",
    ].includes(v.template);
    if (academic) {
      require("department", Boolean(v.department && v.department.length >= 2), "Enter your department");
    }

    const needsTopic = [
      "academic_fyp",
      "academic_termpaper",
      "academic_seminar",
      "academic_it",
      "design_presentation",
    ].includes(v.template);
    if (needsTopic) {
      require("projectTitle", Boolean(v.projectTitle && v.projectTitle.length >= 3), "Enter the topic");
    }

    if (v.template === "academic_termpaper") {
      require("courseTitle", Boolean(v.courseTitle), "Enter the course title");
    }
    if (v.template === "academic_it") {
      require("companyName", Boolean(v.companyName), "Enter the company / organisation name");
      require("itDuration", Boolean(v.itDuration), "How long was the IT placement?");
    }
    if (v.template === "career_cv") {
      const hasEducation = (v.education ?? []).some((e) => e.degree || e.school);
      const hasExperience = (v.experience ?? []).some((e) => e.title || e.company);
      require(
        "education",
        hasEducation || hasExperience,
        "Add at least one education or experience entry"
      );
    }
    if (v.template === "design_presentation") {
      require("purpose", Boolean(v.purpose), "What is the presentation for?");
    }
    if (v.template === "editing") {
      require("editingType", Boolean(v.editingType), "Choose editing or formatting");
    }
  });

export type IntakeSubmitInput = z.infer<typeof intakeSubmitSchema>;
