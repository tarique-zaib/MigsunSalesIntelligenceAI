
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MigsunSales.Api.Migrations
{
    public partial class AddRecommendationReviews : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // RecommendationReviews already exists because its SQL script
            // was applied manually. No table creation is needed here.
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Intentionally preserve the existing table and its data.
        }
    }
}
