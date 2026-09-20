import { z } from "zod";
import { DataRequirement, ProjectType, ReferencingStyle } from "@prisma/client";
import { phoneSchema } from "@/lib/validations/clients";

const projectTypeValues = Object.values(ProjectType) as [ProjectType, ...ProjectType[]];
const referencingValues = Object.values(ReferencingStyle) as [ReferencingStyle, ...ReferencingStyle[]];
const dataValues = Object.values(DataRequirement) as [DataRequirement, ...DataRequirement[]];

/** A string that may be blank (blank clears the field). */
const text = (max: number) => z.string().trim().max(max);
const blankOr = <T extends z.ZodTypeAny>(schema: T) => z.union([z.literal(""), schema]);

const optionalInt = (max: number) =>
  z.preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.coerce.number().int().positive().max(max).nullable()
  );

const educationEntry = z.object({
  degree: text(160).optional(),
  school: text(160).optional(),
  year: text(40).optional(),
  cgpa: text(20).optional(),
});
const experienceEntry = z.object({
  title: text(160).optional(),
  company: text(160).optional(),
  dates: text(80).optional(),
  description: text(2000).optional(),
});

/**
 * Admin edit of a project's intake details. Every field is optional: only what
 * is sent is considered, and a blank value clears an optional field. There is
 * deliberately no field for passwords, price, payments or referral code.
 */
export const intakeEditSchema = z.object({
  client: z
    .object({
      fullName: text(120).min(2, "Enter the full name"),
      phone: phoneSchema,
      email: text(160).email("Enter a valid email"),
      universityId: z.string().min(1, "Select a university"),
      faculty: text(120),
      department: text(120).min(2, "Enter the department"),
      level: text(40),
    })
    .partial()
    .default({}),
  project: z
    .object({
      projectTitle: text(300).min(3, "Enter the topic"),
      matricNumber: text(60),
      supervisorName: text(1000),
      otherSupervisors: text(1000),
      hodName: text(1000),
      projectPartners: text(1000),
      projectType: blankOr(z.enum(projectTypeValues)),
      chapterCount: optionalInt(20),
      referencingStyle: blankOr(z.enum(referencingValues)),
      dataRequirements: blankOr(z.enum(dataValues)),
      minimumPages: text(1000),
      clientDeadline: blankOr(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date")),
      departmentOutline: text(6000),
      specialInstructions: text(6000),
      dedicationType: blankOr(z.enum(["God", "Family", "Both", "Custom"])),
      dedicationDetails: text(6000),
      acknowledgmentDetails: text(6000),
    })
    .partial()
    .default({}),
  additional: z
    .object({
      proposalNotes: text(6000),
      courseTitle: text(1000),
      courseCode: text(1000),
      wordCount: optionalInt(200_000),
      lecturerInstructions: text(6000),
      companyName: text(1000),
      companyAddress: text(1000),
      itDuration: text(1000),
      companyDepartment: text(1000),
      companySupervisor: text(1000),
      linkedin: text(200),
      address: text(300),
      skills: z.array(text(60).min(1)).max(40),
      certifications: z.array(text(120).min(1)).max(20),
      stylePreference: blankOr(z.enum(["Modern", "Classic", "Creative"])),
      education: z.array(educationEntry).max(15),
      experience: z.array(experienceEntry).max(15),
      purpose: text(1000),
      audience: text(1000),
      slideCount: optionalInt(300),
      contentSource: text(6000),
      colorScheme: text(1000),
      designStyle: text(1000),
      editingType: blankOr(z.enum(["Editing", "Formatting", "Both"])),
      pageCount: optionalInt(5000),
    })
    .partial()
    .default({}),
});

export type IntakeEditInput = z.infer<typeof intakeEditSchema>;
