using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vector.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialFinance : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Workspaces",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    ReserveCents = table.Column<long>(type: "INTEGER", nullable: false),
                    SinkingFundCents = table.Column<long>(type: "INTEGER", nullable: false),
                    DailyPlanCents = table.Column<long>(type: "INTEGER", nullable: false),
                    Ambient = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Workspaces", x => x.Id);
                    table.CheckConstraint("CK_Settings_NonNegative", "ReserveCents >= 0 AND SinkingFundCents >= 0 AND DailyPlanCents >= 0");
                });

            migrationBuilder.CreateTable(
                name: "Accounts",
                columns: table => new
                {
                    WorkspaceId = table.Column<string>(type: "TEXT", nullable: false),
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    Institution = table.Column<string>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", nullable: false),
                    LastFour = table.Column<string>(type: "TEXT", nullable: false),
                    Type = table.Column<string>(type: "TEXT", nullable: false),
                    ObservedBalanceCents = table.Column<long>(type: "INTEGER", nullable: false),
                    LocalAdjustmentCents = table.Column<long>(type: "INTEGER", nullable: false),
                    Liquid = table.Column<bool>(type: "INTEGER", nullable: false),
                    DisplayOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    SyncState = table.Column<string>(type: "TEXT", nullable: false),
                    LastSyncedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    SyncMessage = table.Column<string>(type: "TEXT", nullable: true),
                    CreditLimitCents = table.Column<long>(type: "INTEGER", nullable: true),
                    PaymentDate = table.Column<DateOnly>(type: "TEXT", nullable: true),
                    UpcomingPaymentCents = table.Column<long>(type: "INTEGER", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Accounts", x => new { x.WorkspaceId, x.Id });
                    table.CheckConstraint("CK_Account_Liquid", "Type != 'credit' OR Liquid = 0");
                    table.CheckConstraint("CK_Account_Mask", "length(LastFour) = 4 AND LastFour NOT GLOB '*[^0-9]*'");
                    table.CheckConstraint("CK_Account_Sync", "SyncState IN ('nominal','syncing','attention')");
                    table.CheckConstraint("CK_Account_Type", "Type IN ('checking','savings','credit')");
                    table.ForeignKey(
                        name: "FK_Accounts_Workspaces_WorkspaceId",
                        column: x => x.WorkspaceId,
                        principalTable: "Workspaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Allocations",
                columns: table => new
                {
                    WorkspaceId = table.Column<string>(type: "TEXT", nullable: false),
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", nullable: false),
                    AmountCents = table.Column<long>(type: "INTEGER", nullable: false),
                    Color = table.Column<string>(type: "TEXT", nullable: false),
                    DisplayOrder = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Allocations", x => new { x.WorkspaceId, x.Id });
                    table.CheckConstraint("CK_Allocation_Money", "AmountCents >= 0");
                    table.ForeignKey(
                        name: "FK_Allocations_Workspaces_WorkspaceId",
                        column: x => x.WorkspaceId,
                        principalTable: "Workspaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Memberships",
                columns: table => new
                {
                    WorkspaceId = table.Column<string>(type: "TEXT", nullable: false),
                    Subject = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Memberships", x => new { x.WorkspaceId, x.Subject });
                    table.ForeignKey(
                        name: "FK_Memberships_Workspaces_WorkspaceId",
                        column: x => x.WorkspaceId,
                        principalTable: "Workspaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Entries",
                columns: table => new
                {
                    WorkspaceId = table.Column<string>(type: "TEXT", nullable: false),
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    AccountId = table.Column<string>(type: "TEXT", nullable: false),
                    Kind = table.Column<string>(type: "TEXT", nullable: false),
                    Source = table.Column<string>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", nullable: false),
                    AmountCents = table.Column<long>(type: "INTEGER", nullable: false),
                    Date = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    Variability = table.Column<string>(type: "TEXT", nullable: false),
                    Frequency = table.Column<string>(type: "TEXT", nullable: true),
                    IntervalDays = table.Column<int>(type: "INTEGER", nullable: true),
                    Category = table.Column<string>(type: "TEXT", nullable: false),
                    IncludedInForecast = table.Column<bool>(type: "INTEGER", nullable: false),
                    PrimaryPaycheck = table.Column<bool>(type: "INTEGER", nullable: false),
                    Merchant = table.Column<string>(type: "TEXT", nullable: true),
                    Notes = table.Column<string>(type: "TEXT", nullable: true),
                    Archived = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Entries", x => new { x.WorkspaceId, x.Id });
                    table.CheckConstraint("CK_Entry_Frequency", "Frequency IS NULL OR Frequency IN ('weekly','biweekly','semimonthly','monthly','quarterly','annual','custom')");
                    table.CheckConstraint("CK_Entry_Interval", "Frequency != 'custom' OR (IntervalDays IS NOT NULL AND IntervalDays > 0)");
                    table.CheckConstraint("CK_Entry_Kind", "Kind IN ('income','expense')");
                    table.CheckConstraint("CK_Entry_Money", "AmountCents > 0");
                    table.CheckConstraint("CK_Entry_Paycheck", "PrimaryPaycheck = 0 OR Kind = 'income'");
                    table.CheckConstraint("CK_Entry_Source", "Source IN ('manual','synced','projected')");
                    table.CheckConstraint("CK_Entry_Variability", "Variability IN ('static','dynamic')");
                    table.ForeignKey(
                        name: "FK_Entries_Accounts_WorkspaceId_AccountId",
                        columns: x => new { x.WorkspaceId, x.AccountId },
                        principalTable: "Accounts",
                        principalColumns: new[] { "WorkspaceId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Entries_Workspaces_WorkspaceId",
                        column: x => x.WorkspaceId,
                        principalTable: "Workspaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Reservations",
                columns: table => new
                {
                    WorkspaceId = table.Column<string>(type: "TEXT", nullable: false),
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    AccountId = table.Column<string>(type: "TEXT", nullable: false),
                    AmountCents = table.Column<long>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Reservations", x => new { x.WorkspaceId, x.Id });
                    table.CheckConstraint("CK_Reservation_Money", "AmountCents > 0");
                    table.ForeignKey(
                        name: "FK_Reservations_Accounts_WorkspaceId_AccountId",
                        columns: x => new { x.WorkspaceId, x.AccountId },
                        principalTable: "Accounts",
                        principalColumns: new[] { "WorkspaceId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Reservations_Workspaces_WorkspaceId",
                        column: x => x.WorkspaceId,
                        principalTable: "Workspaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Occurrences",
                columns: table => new
                {
                    WorkspaceId = table.Column<string>(type: "TEXT", nullable: false),
                    EntryId = table.Column<string>(type: "TEXT", nullable: false),
                    Date = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    State = table.Column<string>(type: "TEXT", nullable: false),
                    CompletedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Occurrences", x => new { x.WorkspaceId, x.EntryId, x.Date });
                    table.CheckConstraint("CK_Occurrence_State", "(State = 'completed' AND CompletedAt IS NOT NULL) OR (State = 'skipped' AND CompletedAt IS NULL)");
                    table.ForeignKey(
                        name: "FK_Occurrences_Entries_WorkspaceId_EntryId",
                        columns: x => new { x.WorkspaceId, x.EntryId },
                        principalTable: "Entries",
                        principalColumns: new[] { "WorkspaceId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Occurrences_Workspaces_WorkspaceId",
                        column: x => x.WorkspaceId,
                        principalTable: "Workspaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Entries_WorkspaceId",
                table: "Entries",
                column: "WorkspaceId",
                unique: true,
                filter: "PrimaryPaycheck = 1 AND Archived = 0");

            migrationBuilder.CreateIndex(
                name: "IX_Entries_WorkspaceId_AccountId",
                table: "Entries",
                columns: new[] { "WorkspaceId", "AccountId" });

            migrationBuilder.CreateIndex(
                name: "IX_Reservations_WorkspaceId_AccountId",
                table: "Reservations",
                columns: new[] { "WorkspaceId", "AccountId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Allocations");

            migrationBuilder.DropTable(
                name: "Memberships");

            migrationBuilder.DropTable(
                name: "Occurrences");

            migrationBuilder.DropTable(
                name: "Reservations");

            migrationBuilder.DropTable(
                name: "Entries");

            migrationBuilder.DropTable(
                name: "Accounts");

            migrationBuilder.DropTable(
                name: "Workspaces");
        }
    }
}
