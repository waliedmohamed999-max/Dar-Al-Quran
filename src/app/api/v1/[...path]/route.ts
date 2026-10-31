import type { NextRequest } from "next/server";
import { dispatch } from "@/lib/api";
import { endpoints } from "@/modules/api/endpoints";

type Arg = { params: Promise<{ path: string[] }> };

const handle = async (req: NextRequest, { params }: Arg) => dispatch(req, "/" + (await params).path.join("/"), endpoints);

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
