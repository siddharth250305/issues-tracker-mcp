import { useState } from "react";
import { Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import StatusBadge from "@/components/common/StatusBadge";
import TagBadge from "@/components/common/TagBadge";
import UserAvatar from "@/components/common/UserAvatar";
import { ConfirmDialog } from "@/components/common";
import type { Issue } from "@/types";

interface IssueCardProps {
  issue: Issue;
  className?: string;
  showActions?: boolean;
  onEdit?: (issue: Issue) => void;
  onDelete?: (issue: Issue) => void;
}

const priorityConfig = {
  low: {
    variant: "outline" as const,
    label: "Low",
    className: "text-gray-600 border-gray-300",
  },
  medium: {
    variant: "secondary" as const,
    label: "Medium", 
    className: "text-yellow-700 bg-yellow-100 border-yellow-300",
  },
  high: {
    variant: "default" as const,
    label: "High",
    className: "text-orange-700 bg-orange-100 border-orange-300",
  },
  urgent: {
    variant: "destructive" as const,
    label: "Urgent",
    className: "text-red-700 bg-red-100 border-red-300",
  },
};

export default function IssueCard({ 
  issue, 
  className,
  showActions = false,
  onEdit,
  onDelete 
}: IssueCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const priorityStyle = priorityConfig[issue.priority] || priorityConfig.low;
  
  // Format date for display
  const formatDate = (dateString: string) => {
    if (!dateString) return "Invalid Date";
    
    // Handle SQLite datetime format (YYYY-MM-DD HH:MM:SS)
    // Add 'T' to make it ISO format if it's missing
    const isoDateString = dateString.includes('T') ? dateString : dateString.replace(' ', 'T');
    
    const date = new Date(isoDateString);
    if (isNaN(date.getTime())) return "Invalid Date";
    
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <Card className={`hover:shadow-md transition-shadow ${className || ""}`}>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start gap-3">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg leading-6">
              <Link 
                to={`/issues/${issue.id}`}
                className="hover:text-primary transition-colors"
              >
                {issue.title}
              </Link>
            </CardTitle>
            
            {issue.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {issue.description}
              </p>
            )}
          </div>
          
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <StatusBadge status={issue.status} />
            
            <Badge 
              variant={priorityStyle.variant}
              className={priorityStyle.className}
            >
              {priorityStyle.label}
            </Badge>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="space-y-3">
          {/* Tags */}
          {issue.tags && issue.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {issue.tags.map((tag) => (
                <TagBadge key={tag.id} tag={tag} />
              ))}
            </div>
          )}
          
          {/* User info and metadata */}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 text-sm text-muted-foreground">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              {issue.created_by_user && (
                <div className="flex items-center gap-1">
                  <span>Created by</span>
                  <UserAvatar user={issue.created_by_user} size="sm" showName />
                </div>
              )}
              
              {issue.assigned_user && (
                <div className="flex items-center gap-1">
                  <span>Assigned to</span>
                  <UserAvatar user={issue.assigned_user} size="sm" showName />
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <span>#{issue.id}</span>
              <span>•</span>
              <span>{formatDate(issue.created_at)}</span>
            </div>
          </div>
          
          {/* Action buttons */}
          {showActions && (onEdit || onDelete) && (
            <div className="flex justify-end gap-2 pt-2 border-t">
              {onEdit && (
                <button
                  onClick={() => onEdit(issue)}
                  className="text-xs text-primary hover:underline"
                >
                  Edit
                </button>
              )}
              {onDelete && (
                <>
                  <button
                    onClick={() => setShowDeleteDialog(true)}
                    className="text-xs text-destructive hover:underline"
                  >
                    Delete
                  </button>
                  <ConfirmDialog
                    isOpen={showDeleteDialog}
                    onClose={() => setShowDeleteDialog(false)}
                    onConfirm={() => {
                      onDelete(issue);
                      setShowDeleteDialog(false);
                    }}
                    title="Delete Issue"
                    description={`Are you sure you want to delete "${issue.title}"? This action cannot be undone.`}
                    confirmText="Delete"
                    variant="destructive"
                  />
                </>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
