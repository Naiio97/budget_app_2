# Pydantic modely GoCardless API (podmnožina swaggeru, kterou používá
# services/gocardless.py). Původně vygenerováno datamodel-codegen z
# https://bankaccountdata.gocardless.com/api/v2/swagger.json

from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID

from pydantic import AnyUrl, BaseModel, Field, constr


class AccountSchema(BaseModel):
    iban: str | None = Field(None, description='iban')
    bban: str | None = Field(None, description='bban')
    pan: str | None = Field(None, description='pan')
    maskedPan: str | None = Field(None, description='maskedPan')
    msisdn: str | None = Field(None, description='msisdn')
    currency: str | None = Field(None, description='currency')


class AdditionalAccountDataSchema(BaseModel):
    secondaryIdentification: str | None = Field(
        None, description='secondaryIdentification'
    )


class BalanceAmountSchema(BaseModel):
    amount: str = Field(..., description='amount')
    currency: str = Field(..., description='currency')


class BalanceSchema(BaseModel):
    balanceAmount: BalanceAmountSchema = Field(..., description='balanceAmount')
    balanceType: str = Field(..., description='balanceType')
    creditLimitIncluded: bool | None = Field(None, description='creditLimitIncluded')
    lastChangeDateTime: datetime | None = Field(None, description='lastChangeDateTime')
    referenceDate: date | None = Field(None, description='referenceDate')
    lastCommittedTransaction: str | None = Field(
        None, description='lastCommittedTransaction'
    )


class CurrencyExchangeSchema(BaseModel):
    sourceCurrency: str | None = Field(None, description='sourceCurrency')
    exchangeRate: str | None = Field(None, description='exchangeRate')
    unitCurrency: str | None = Field(None, description='unitCurrency')
    targetCurrency: str | None = Field(None, description='targetCurrency')
    quotationDate: date | None = Field(None, description='quotationDate')
    contractIdentification: str | None = Field(
        None, description='contractIdentification'
    )


class Integration(BaseModel):
    id: str
    name: str
    bic: str | None = None
    transaction_total_days: str | None = '90'
    max_access_valid_for_days: str | None = None
    max_access_valid_for_days_reconfirmation: str | None = None
    countries: list[str]
    logo: str


class OwnerAddressStructuredSchema(BaseModel):
    streetName: str | None = Field(None, description='streetName')
    buildingNumber: str | None = Field(None, description='buildingNumber')
    townName: str | None = Field(None, description='townName')
    postCode: str | None = Field(None, description='postCode')
    country: str | None = Field(None, description='country')


class StatusEnum(StrEnum):
    CR = 'CR'
    ID = 'ID'
    LN = 'LN'
    RJ = 'RJ'
    ER = 'ER'
    SU = 'SU'
    EX = 'EX'
    GC = 'GC'
    UA = 'UA'
    GA = 'GA'
    SA = 'SA'
    CZ = 'CZ'


class TransactionAmountSchema(BaseModel):
    amount: str = Field(..., description='amount')
    currency: str = Field(..., description='currency')


class AccountBalance(BaseModel):
    balances: list[BalanceSchema] | None = None


class BalanceAfterTransactionSchema(BaseModel):
    balanceAmount: TransactionAmountSchema = Field(..., description='balanceAmount')
    balanceType: str = Field(..., description='balanceType')


class DetailSchema(BaseModel):
    resourceId: str | None = Field(None, description='resourceId')
    iban: str | None = Field(None, description='iban')
    bban: str | None = Field(None, description='bban')
    scan: str | None = Field(
        None,
        description='SortCodeAccountNumber returned by some UK banks (6 digit Sort Code and 8 digit Account Number)',
    )
    msisdn: str | None = Field(None, description='msisdn')
    currency: str | None = Field(None, description='currency')
    ownerName: str | None = Field(None, description='ownerName')
    name: str | None = Field(None, description='name')
    displayName: str | None = Field(None, description='displayName')
    product: str | None = Field(None, description='product')
    cashAccountType: str | None = Field(None, description='cashAccountType')
    status: str | None = Field(None, description='status')
    bic: str | None = Field(None, description='bic')
    linkedAccounts: str | None = Field(None, description='linkedAccounts')
    maskedPan: str | None = Field(None, description='maskedPan')
    usage: str | None = Field(None, description='usage')
    details: str | None = Field(None, description='details')
    ownerAddressUnstructured: list[str] | None = Field(
        None, description='ownerAddressUnstructured'
    )
    ownerAddressStructured: OwnerAddressStructuredSchema | None = Field(
        None, description='ownerAddressStructured'
    )
    additionalAccountData: AdditionalAccountDataSchema | None = Field(
        None,
        description='additionalAccountData used for information that is outside of Berlin Group specification, such as bank or country-specific fields',
    )


class Requisition(BaseModel):
    id: UUID | None = None
    created: datetime | None = Field(
        None,
        description='The date & time at which the requisition was created.',
        title='Created Date',
    )
    redirect: AnyUrl = Field(
        ...,
        description='redirect URL to your application after end-user authorization with ASPSP',
    )
    status: StatusEnum | None = Field(
        None, description='status of this requisition', title='Requisition status'
    )
    institution_id: str = Field(
        ..., description='an Institution ID for this Requisition'
    )
    agreement: UUID | None = Field(
        None, description='EUA associated with this requisition'
    )
    reference: constr(max_length=256) | None = Field(
        None, description='additional ID to identify the end user'
    )
    accounts: list[UUID] | None = Field(
        None,
        description='array of account IDs retrieved within a scope of this requisition',
    )
    user_language: constr(max_length=5) | None = Field(
        None, description='A two-letter country code (ISO 639-1)'
    )
    link: AnyUrl | None = Field(
        'https://ob.gocardless.com/psd2/start/3fa85f64-5717-4562-b3fc-2c963f66afa6/SANDBOXFINANCE_SFIN0000',
        description='link to initiate authorization with Institution',
    )
    ssn: constr(max_length=64) | None = Field(
        None, description='optional SSN field to verify ownership of the account'
    )
    account_selection: bool | None = Field(
        False, description='option to enable account selection view for the end user'
    )
    redirect_immediate: bool | None = Field(
        False,
        description='enable redirect back to the client after account list received',
    )


class SpectacularRequisition(BaseModel):
    id: UUID | None = None
    created: datetime | None = Field(
        None,
        description='The date & time at which the requisition was created.',
        title='Created Date',
    )
    redirect: AnyUrl = Field(
        ...,
        description='redirect URL to your application after end-user authorization with ASPSP',
    )
    status: StatusEnum | None = Field(
        None, description='status of this requisition', title='Requisition status'
    )
    institution_id: str = Field(
        ..., description='an Institution ID for this Requisition'
    )
    agreement: UUID | None = Field(
        None, description='EUA associated with this requisition'
    )
    reference: constr(max_length=256) | None = Field(
        None, description='additional ID to identify the end user'
    )
    accounts: list[Any] | None = Field(
        [],
        description='array of account IDs retrieved within a scope of this requisition',
    )
    user_language: constr(max_length=5) | None = Field(
        None, description='A two-letter country code (ISO 639-1)'
    )
    link: AnyUrl | None = Field(
        'https://ob.gocardless.com/psd2/start/3fa85f64-5717-4562-b3fc-2c963f66afa6/SANDBOXFINANCE_SFIN0000',
        description='link to initiate authorization with Institution',
    )
    ssn: constr(max_length=64) | None = Field(
        None, description='optional SSN field to verify ownership of the account'
    )
    account_selection: bool | None = Field(
        False, description='option to enable account selection view for the end user'
    )
    redirect_immediate: bool | None = Field(
        False,
        description='enable redirect back to the client after account list received',
    )


class TransactionSchema(BaseModel):
    transactionId: str | None = Field(None, description='transactionId')
    entryReference: str | None = Field(None, description='entryReference')
    endToEndId: str | None = Field(None, description='endToEndId')
    mandateId: str | None = Field(None, description='mandateId')
    checkId: str | None = Field(None, description='checkId')
    creditorId: str | None = Field(None, description='creditorId')
    bookingDate: date | None = Field(None, description='bookingDate')
    valueDate: date | None = Field(None, description='valueDate')
    bookingDateTime: datetime | None = Field(None, description='bookingDateTime')
    valueDateTime: datetime | None = Field(None, description='valueDateTime')
    transactionAmount: TransactionAmountSchema = Field(
        ..., description='transactionAmount'
    )
    currencyExchange: list[CurrencyExchangeSchema] | None = None
    creditorName: str | None = Field(None, description='creditorName')
    creditorAccount: AccountSchema | None = Field(None, description='creditorAccount')
    ultimateCreditor: str | None = Field(None, description='ultimateCreditor')
    debtorName: str | None = Field(None, description='debtorName')
    debtorAccount: AccountSchema | None = Field(None, description='debtorAccount')
    ultimateDebtor: str | None = Field(None, description='ultimateDebtor')
    remittanceInformationUnstructured: str | None = Field(
        None, description='remittanceInformationUnstructured'
    )
    remittanceInformationUnstructuredArray: list[str] | None = Field(
        None, description='remittanceInformationUnstructuredArray'
    )
    remittanceInformationStructured: str | None = Field(
        None, description='remittanceInformationStructured'
    )
    remittanceInformationStructuredArray: list[str] | None = Field(
        None, description='remittanceInformationStructuredArray'
    )
    additionalInformation: str | None = Field(None, description='additionalInformation')
    purposeCode: str | None = Field(None, description='purposeCode')
    bankTransactionCode: str | None = Field(None, description='bankTransactionCode')
    proprietaryBankTransactionCode: str | None = Field(
        None, description='proprietaryBankTransactionCode'
    )
    internalTransactionId: str | None = Field(None, description='internalTransactionId')
    balanceAfterTransaction: BalanceAfterTransactionSchema | None = Field(
        None, description='balanceAfterTransaction'
    )


class AccountDetail(BaseModel):
    account: DetailSchema = Field(..., description='account')
