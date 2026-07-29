-- CreateTable
CREATE TABLE "connector_credentials" (
    "id" TEXT NOT NULL,
    "connector" TEXT NOT NULL,
    "external_account_id" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connector_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "connector_credentials_connector_external_account_id_key" ON "connector_credentials"("connector", "external_account_id");
