using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MigsunSales.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddFollowUpActions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "FollowUpActions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    LeadId = table.Column<Guid>(type: "uuid", nullable: false),
                    DueAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsCompleted = table.Column<bool>(type: "boolean", nullable: false),
                    CompletedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CompletedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    CompletedByName = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FollowUpActions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FollowUpActions_Leads_LeadId",
                        column: x => x.LeadId,
                        principalTable: "Leads",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_FollowUpActions_CompletedAtUtc",
                table: "FollowUpActions",
                column: "CompletedAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_FollowUpActions_LeadId_DueAtUtc",
                table: "FollowUpActions",
                columns: new[] { "LeadId", "DueAtUtc" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "FollowUpActions");
        }
    }
}
