"use client";

import useSWR, { type KeyedMutator } from "swr";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useState } from "react";
import { Input } from "@/components/Input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createKnowledgeBody,
  type CreateKnowledgeBody,
} from "@/utils/actions/knowledge.validation";
import { createKnowledgeAction } from "@/utils/actions/knowledge";
import { toastError, toastSuccess } from "@/components/Toast";
import { isActionError } from "@/utils/error";
import { LoadingContent } from "@/components/LoadingContent";
import type { GetKnowledgeResponse } from "@/app/api/knowledge/route";
import { formatDateSimple } from "@/utils/date";

export default function KnowledgeBase() {
  const [isOpen, setIsOpen] = useState(false);
  const { data, isLoading, error, mutate } =
    useSWR<GetKnowledgeResponse>("/api/knowledge");

  return (
    <div>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button variant="outline">
            <Plus className="mr-2 h-4 w-4" />
            Add
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Knowledge Base Entry</DialogTitle>
          </DialogHeader>
          <KnowledgeForm
            closeDialog={() => setIsOpen(false)}
            refetch={mutate}
          />
        </DialogContent>
      </Dialog>

      <Card className="mt-2">
        <LoadingContent loading={isLoading} error={error}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-24 text-center">
                    No knowledge base entries. Click the Add button to create
                    one.
                    <br />
                    Knowledge base entries are used to help draft responses to
                    emails.
                  </TableCell>
                </TableRow>
              ) : (
                data?.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.title}</TableCell>
                    <TableCell>
                      {formatDateSimple(new Date(item.updatedAt))}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm">
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </LoadingContent>
      </Card>
    </div>
  );
}

function KnowledgeForm({
  closeDialog,
  refetch,
}: {
  closeDialog: () => void;
  refetch: KeyedMutator<GetKnowledgeResponse>;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateKnowledgeBody>({
    resolver: zodResolver(createKnowledgeBody),
  });

  const onSubmit = async (data: CreateKnowledgeBody) => {
    const result = await createKnowledgeAction(data);

    refetch();

    if (isActionError(result)) {
      toastError({
        title: "Error creating knowledge base entry",
        description: result.error,
      });
      return;
    }

    toastSuccess({
      description: "Knowledge base entry created successfully",
    });
    closeDialog();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input
        type="text"
        name="title"
        label="Title"
        registerProps={register("title")}
        error={errors.title}
      />
      <Input
        type="text"
        name="content"
        label="Content"
        autosizeTextarea
        rows={5}
        registerProps={register("content")}
        error={errors.content}
      />
      <Button type="submit" loading={isSubmitting}>
        Create
      </Button>
    </form>
  );
}
