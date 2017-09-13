import * as _ from 'lodash';
import * as React from 'react';
import * as accounting from 'accounting';
import {Link} from 'react-router-dom';
import {ZeroEx} from '0x.js';
import * as moment from 'moment';
import * as BigNumber from 'bignumber.js';
import Paper from 'material-ui/Paper';
import {Card, CardText, CardHeader} from 'material-ui/Card';
import Divider from 'material-ui/Divider';
import TextField from 'material-ui/TextField';
import RaisedButton from 'material-ui/RaisedButton';
import {utils} from 'ts/utils/utils';
import {constants} from 'ts/utils/constants';
import {zeroEx} from 'ts/utils/zero_ex';
import {
    Side,
    TokenByAddress,
    Order,
    BlockchainErrs,
    OrderToken,
    Token,
    ExchangeContractErrs,
    AlertTypes,
    ContractResponse,
} from 'ts/types';
import {Alert} from 'ts/components/ui/alert';
import {Identicon} from 'ts/components/ui/identicon';
import {EthereumAddress} from 'ts/components/ui/ethereum_address';
import {TokenAmountInput} from 'ts/components/inputs/token_amount_input';
import {FillWarningDialog} from 'ts/components/fill_warning_dialog';
import {FillOrderJSON} from 'ts/components/fill_order_json';
import {VisualOrder} from 'ts/components/visual_order';
import {SchemaValidator} from 'ts/schemas/validator';
import {orderSchema} from 'ts/schemas/order_schema';
import {Dispatcher} from 'ts/redux/dispatcher';
import {Blockchain} from 'ts/blockchain';
import {errorReporter} from 'ts/utils/error_reporter';
import {customTokenStorage} from 'ts/local_storage/custom_token_storage';

const CUSTOM_LIGHT_GRAY = '#BBBBBB';

interface FillOrderProps {
    blockchain: Blockchain;
    blockchainErr: BlockchainErrs;
    orderFillAmount: BigNumber.BigNumber;
    isOrderInUrl: boolean;
    networkId: number;
    userAddress: string;
    tokenByAddress: TokenByAddress;
    initialOrder: Order;
    dispatcher: Dispatcher;
}

interface FillOrderState {
    didOrderValidationRun: boolean;
    globalErrMsg: string;
    orderJSON: string;
    orderJSONErrMsg: string;
    parsedOrder: Order;
    didFillOrderSucceed: boolean;
    unavailableTakerAmount: BigNumber.BigNumber;
    isMakerTokenAddressInRegistry: boolean;
    isTakerTokenAddressInRegistry: boolean;
    isFillWarningDialogOpen: boolean;
    isFilling: boolean;
}

export class FillOrder extends React.Component<FillOrderProps, FillOrderState> {
    private validator: SchemaValidator;
    constructor(props: FillOrderProps) {
        super(props);
        this.state = {
            globalErrMsg: '',
            didOrderValidationRun: false,
            didFillOrderSucceed: false,
            orderJSON: _.isUndefined(this.props.initialOrder) ? '' : JSON.stringify(this.props.initialOrder),
            orderJSONErrMsg: '',
            parsedOrder: this.props.initialOrder,
            unavailableTakerAmount: new BigNumber(0),
            isMakerTokenAddressInRegistry: false,
            isTakerTokenAddressInRegistry: false,
            isFillWarningDialogOpen: false,
            isFilling: false,
        };
        this.validator = new SchemaValidator();
    }
    public componentWillMount() {
        if (!_.isEmpty(this.state.orderJSON)) {
            this.validateFillOrderFireAndForgetAsync(this.state.orderJSON);
        }
    }
    public componentDidMount() {
        window.scrollTo(0, 0);
    }
    public render() {
        return (
            <div className="clearfix lg-px4 md-px4 sm-px2" style={{minHeight: 600}}>
                <h3>Fill an order</h3>
                <Divider />
                <div>
                    {!this.props.isOrderInUrl &&
                        <div>
                            <div className="pt2 pb2">
                                Paste an order JSON snippet below to begin
                            </div>
                            <div className="pb2">Order JSON</div>
                            <FillOrderJSON
                                blockchain={this.props.blockchain}
                                tokenByAddress={this.props.tokenByAddress}
                                networkId={this.props.networkId}
                                orderJSON={this.state.orderJSON}
                                onFillOrderJSONChanged={this.onFillOrderJSONChanged.bind(this)}
                            />
                            {this.renderOrderJsonNotices()}
                        </div>
                    }
                    <div>
                        {!_.isUndefined(this.state.parsedOrder) && this.state.didOrderValidationRun &&
                             this.renderVisualOrder()
                        }
                    </div>
                    {this.props.isOrderInUrl &&
                        <div className="pt2">
                            <Card style={{boxShadow: 'none', backgroundColor: 'none', border: '1px solid #eceaea'}}>
                                <CardHeader
                                    title="Order JSON"
                                    actAsExpander={true}
                                    showExpandableButton={true}
                                />
                                <CardText expandable={true}>
                                    <FillOrderJSON
                                        blockchain={this.props.blockchain}
                                        tokenByAddress={this.props.tokenByAddress}
                                        networkId={this.props.networkId}
                                        orderJSON={this.state.orderJSON}
                                        onFillOrderJSONChanged={this.onFillOrderJSONChanged.bind(this)}
                                    />
                                </CardText>
                            </Card>
                            {this.renderOrderJsonNotices()}
                        </div>
                    }
                </div>
                <FillWarningDialog
                    isOpen={this.state.isFillWarningDialogOpen}
                    onToggleDialog={this.onFillWarningClosed.bind(this)}
                />
            </div>
        );
    }
    private renderOrderJsonNotices() {
        return (
            <div>
                {!_.isUndefined(this.props.initialOrder) && !this.state.didOrderValidationRun &&
                    <div className="pt2">
                        <span className="pr1">
                            <i className="zmdi zmdi-spinner zmdi-hc-spin" />
                        </span>
                        <span>Validating order...</span>
                    </div>
                }
                {this.state.orderJSONErrMsg !== '' &&
                    <Alert type={AlertTypes.ERROR} message={this.state.orderJSONErrMsg} />
                }
            </div>
        );
    }
    private renderVisualOrder() {
        const takerTokenAddress = this.state.parsedOrder.taker.token.address;
        const takerToken = this.props.tokenByAddress[takerTokenAddress];
        const orderTakerAmount = new BigNumber(this.state.parsedOrder.taker.amount);
        const orderMakerAmount = new BigNumber(this.state.parsedOrder.maker.amount);
        const takerAssetToken = {
            amount: orderTakerAmount.minus(this.state.unavailableTakerAmount),
            symbol: takerToken.symbol,
        };
        const fillToken = this.props.tokenByAddress[takerToken.address];
        const makerTokenAddress = this.state.parsedOrder.maker.token.address;
        const makerToken = this.props.tokenByAddress[makerTokenAddress];
        const makerAssetToken = {
            amount: orderMakerAmount.times(takerAssetToken.amount).div(orderTakerAmount),
            symbol: makerToken.symbol,
        };
        const fillAssetToken = {
            amount: this.props.orderFillAmount,
            symbol: takerToken.symbol,
        };
        const orderTaker = this.state.parsedOrder.taker.address !== '' ? this.state.parsedOrder.taker.address :
                           this.props.userAddress;
        const parsedOrderExpiration = new BigNumber(this.state.parsedOrder.expiration);
        const exchangeRate = orderMakerAmount.div(orderTakerAmount);

        let orderReceiveAmount = 0;
        if (!_.isUndefined(this.props.orderFillAmount)) {
            const orderReceiveAmountBigNumber = exchangeRate.mul(this.props.orderFillAmount);
            orderReceiveAmount = this.formatCurrencyAmount(orderReceiveAmountBigNumber, makerToken.decimals);
        }

        const expiryDate = utils.convertToReadableDateTimeFromUnixTimestamp(parsedOrderExpiration);
        return (
            <div className="pt3 pb1">
                <div className="clearfix pb2" style={{width: '100%'}}>
                    <div className="inline left">Order details</div>
                    <div className="inline right" style={{minWidth: 208}}>
                        <div className="col col-4 pl2" style={{color: '#BEBEBE'}}>
                            Maker:
                        </div>
                        <div className="col col-2 pr1">
                            <Identicon
                                address={this.state.parsedOrder.maker.address}
                                diameter={23}
                            />
                        </div>
                        <div className="col col-6">
                            <EthereumAddress
                                address={this.state.parsedOrder.maker.address}
                                networkId={this.props.networkId}
                            />
                        </div>
                    </div>
                </div>
                <div className="lg-px4 md-px4 sm-px0">
                    <div className="lg-px4 md-px4 sm-px1 pt1">
                        <VisualOrder
                            orderTakerAddress={orderTaker}
                            orderMakerAddress={this.state.parsedOrder.maker.address}
                            makerAssetToken={makerAssetToken}
                            takerAssetToken={takerAssetToken}
                            makerToken={makerToken}
                            takerToken={takerToken}
                            networkId={this.props.networkId}
                            isMakerTokenAddressInRegistry={this.state.isMakerTokenAddressInRegistry}
                            isTakerTokenAddressInRegistry={this.state.isTakerTokenAddressInRegistry}
                        />
                        <div className="center pt3 pb2">
                            Expires: {expiryDate} UTC
                        </div>
                    </div>
                </div>
                <div className="clearfix mx-auto" style={{width: 315, height: 108}}>
                   <div className="col col-7" style={{maxWidth: 235}}>
                       <TokenAmountInput
                           label="Fill amount"
                           onChange={this.onFillAmountChange.bind(this)}
                           shouldShowIncompleteErrs={false}
                           token={fillToken}
                           amount={fillAssetToken.amount}
                           shouldCheckBalance={true}
                           shouldCheckAllowance={true}
                       />
                   </div>
                   <div
                       className="col col-5 pl1"
                       style={{color: CUSTOM_LIGHT_GRAY, paddingTop: 39}}
                   >
                       = {accounting.formatNumber(orderReceiveAmount, 6)} {makerToken.symbol}
                   </div>
                </div>
                <div>
                    <RaisedButton
                        style={{width: '100%'}}
                        disabled={this.state.isFilling}
                        label={this.state.isFilling ? 'Filling order...' : 'Fill order'}
                        onClick={this.onFillOrderClick.bind(this)}
                    />
                    {this.state.globalErrMsg !== '' &&
                        <Alert type={AlertTypes.ERROR} message={this.state.globalErrMsg} />
                    }
                    {this.state.didFillOrderSucceed &&
                        <Alert
                            type={AlertTypes.SUCCESS}
                            message={this.renderSuccessMsg()}
                        />
                    }
                </div>
            </div>
        );
    }
    private renderSuccessMsg() {
        return (
            <div>
                Order successfully filled. See the trade details in your{' '}
                <Link
                    to="/portal/trades"
                    style={{color: 'white'}}
                >
                    trade history
                </Link>
            </div>
        );
    }
    private onFillOrderClick() {
        if (!this.state.isMakerTokenAddressInRegistry || !this.state.isTakerTokenAddressInRegistry) {
            this.setState({
                isFillWarningDialogOpen: true,
            });
        } else {
            this.onFillOrderClickFireAndForgetAsync();
        }
    }
    private onFillWarningClosed(didUserCancel: boolean) {
        this.setState({
            isFillWarningDialogOpen: false,
        });
        if (!didUserCancel) {
            this.onFillOrderClickFireAndForgetAsync();
        }
    }
    private onFillAmountChange(isValid: boolean, amount?: BigNumber.BigNumber) {
        this.props.dispatcher.updateOrderFillAmount(amount);
    }
    private onFillOrderJSONChanged(e: any) {
        const orderJSON = e.target.value;
        this.setState({
            didOrderValidationRun: _.isEmpty(orderJSON) && _.isEmpty(this.state.orderJSONErrMsg),
            didFillOrderSucceed: false,
        });
        this.validateFillOrderFireAndForgetAsync(orderJSON);
    }
    private async validateFillOrderFireAndForgetAsync(orderJSON: string) {
        let orderJSONErrMsg = '';
        let parsedOrder: Order;
        try {
            const order = JSON.parse(orderJSON);
            const validationResult = this.validator.validate(order, orderSchema);
            if (validationResult.errors.length > 0) {
                orderJSONErrMsg = 'Submitted order JSON is not a valid order';
                utils.consoleLog(`Unexpected order JSON validation error: ${validationResult.errors.join(', ')}`);
                return;
            }
            parsedOrder = order;

            const exchangeContractAddr = this.props.blockchain.getExchangeContractAddressIfExists();
            const makerAmount = new BigNumber(parsedOrder.maker.amount);
            const takerAmount = new BigNumber(parsedOrder.taker.amount);
            const expiration = new BigNumber(parsedOrder.expiration);
            const salt = new BigNumber(parsedOrder.salt);
            const parsedMakerFee = new BigNumber(parsedOrder.maker.feeAmount);
            const parsedTakerFee = new BigNumber(parsedOrder.taker.feeAmount);
            const orderHash = zeroEx.getOrderHash(parsedOrder.exchangeContract, parsedOrder.maker.address,
                            parsedOrder.taker.address, parsedOrder.maker.token.address,
                            parsedOrder.taker.token.address, parsedOrder.feeRecipient,
                            makerAmount, takerAmount, parsedMakerFee, parsedTakerFee,
                            expiration, salt);

            const signature = parsedOrder.signature;
            const isValidSignature = ZeroEx.isValidSignature(signature.hash, signature, parsedOrder.maker.address);
            if (this.props.networkId !== parsedOrder.networkId) {
                orderJSONErrMsg = `This order was made on another Ethereum network
                                   (id: ${parsedOrder.networkId}). Connect to this network to fill.`;
                parsedOrder = undefined;
            } else if (exchangeContractAddr !== parsedOrder.exchangeContract) {
                orderJSONErrMsg = 'This order was made using a deprecated 0x Exchange contract.';
                parsedOrder = undefined;
            } else if (orderHash !== signature.hash) {
                orderJSONErrMsg = 'Order hash does not match supplied plaintext values';
                parsedOrder = undefined;
            } else if (!isValidSignature) {
                orderJSONErrMsg = 'Order signature is invalid';
                parsedOrder = undefined;
            } else {
                // Update user supplied order cache so that if they navigate away from fill view
                // e.g to set a token allowance, when they come back, the fill order persists
                this.props.dispatcher.updateUserSuppliedOrderCache(parsedOrder);
                this.addTokenToCustomTokensIfUnseen(parsedOrder.maker.token);
                this.addTokenToCustomTokensIfUnseen(parsedOrder.taker.token);
            }
        } catch (err) {
            if (orderJSON !== '') {
                orderJSONErrMsg = 'Submitted order JSON is not valid JSON';
            }
            this.setState({
                didOrderValidationRun: true,
                orderJSON,
                orderJSONErrMsg,
                parsedOrder,
            });
            return;
        }

        let unavailableTakerAmount = new BigNumber(0);
        if (orderJSONErrMsg !== '') {
            // Clear cache entry if user updates orderJSON to invalid entry
            this.props.dispatcher.updateUserSuppliedOrderCache(undefined);
        } else {
            const orderHash = parsedOrder.signature.hash;
            unavailableTakerAmount = await this.props.blockchain.getUnavailableTakerAmountAsync(orderHash);
            const isMakerTokenAddressInRegistry = await this.props.blockchain.isAddressInTokenRegistryAsync(
                parsedOrder.maker.token.address,
            );
            const isTakerTokenAddressInRegistry = await this.props.blockchain.isAddressInTokenRegistryAsync(
                parsedOrder.taker.token.address,
            );
            this.setState({
                isMakerTokenAddressInRegistry,
                isTakerTokenAddressInRegistry,
            });
        }

        this.setState({
            didOrderValidationRun: true,
            orderJSON,
            orderJSONErrMsg,
            parsedOrder,
            unavailableTakerAmount,
        });
    }
    private async onFillOrderClickFireAndForgetAsync(): Promise<void> {
        if (this.props.blockchainErr !== '' || this.props.userAddress === '') {
            this.props.dispatcher.updateShouldBlockchainErrDialogBeOpen(true);
            return;
        }

        this.setState({
            isFilling: true,
            didFillOrderSucceed: false,
        });

        const parsedOrder = this.state.parsedOrder;
        const makerTokenAddress = parsedOrder.maker.token.address;
        const takerTokenAddress = parsedOrder.taker.token.address;
        const depositAssetToken = {
            address: makerTokenAddress,
            amount: new BigNumber(parsedOrder.maker.amount),
        };
        const receiveAssetToken = {
            address: takerTokenAddress,
            amount: new BigNumber(parsedOrder.taker.amount),
        };
        const parsedOrderExpiration = new BigNumber(this.state.parsedOrder.expiration);
        const orderHash = parsedOrder.signature.hash;
        const unavailableTakerAmount = await this.props.blockchain.getUnavailableTakerAmountAsync(orderHash);
        const amountLeftToFill = receiveAssetToken.amount.minus(unavailableTakerAmount);
        const specifiedTakerAddressIfExists = parsedOrder.taker.address.toLowerCase();
        const takerFillAmount = this.props.orderFillAmount;
        const makerFillAmount = takerFillAmount.times(depositAssetToken.amount).div(receiveAssetToken.amount);
        const takerAddress = this.props.userAddress;
        const takerToken = this.props.tokenByAddress[takerTokenAddress];
        let isValidSignature = false;
        const signatureData = parsedOrder.signature;
        isValidSignature = ZeroEx.isValidSignature(signatureData.hash, signatureData, parsedOrder.maker.address);

        if (_.isUndefined(takerAddress)) {
            this.props.dispatcher.updateShouldBlockchainErrDialogBeOpen(true);
            this.setState({
                isFilling: false,
            });
            return;
        }

        const [
          makerBalance,
          makerAllowance,
        ] = await this.props.blockchain.getTokenBalanceAndAllowanceAsync(parsedOrder.maker.address,
                                                                         parsedOrder.maker.token.address);
        const currentUnixTimestamp = moment().unix();
        let globalErrMsg = '';
        if (_.isUndefined(takerFillAmount)) {
            globalErrMsg = 'You must specify a fill amount';
        } else if (takerFillAmount.lte(0) || takerFillAmount.gt(takerToken.balance) ||
            takerFillAmount.gt(takerToken.allowance)) {
            globalErrMsg = 'You must fix the above errors in order to fill this order';
        } else if (specifiedTakerAddressIfExists !== '' && specifiedTakerAddressIfExists !== takerAddress) {
            globalErrMsg = `This order can only be filled by ${specifiedTakerAddressIfExists}`;
        } else if (parsedOrderExpiration.lt(currentUnixTimestamp)) {
            globalErrMsg = `This order has expired`;
        } else if (amountLeftToFill.eq(0)) {
            globalErrMsg = 'This order has already been completely filled';
        } else if (takerFillAmount.gt(amountLeftToFill)) {
            const amountLeftToFillInUnits = ZeroEx.toUnitAmount(amountLeftToFill, parsedOrder.taker.token.decimals);
            globalErrMsg = `Cannot fill more then remaining ${amountLeftToFillInUnits} ${takerToken.symbol}`;
        } else if (makerBalance.lt(makerFillAmount)) {
            globalErrMsg = 'Maker no longer has a sufficient balance to complete this order';
        } else if (makerAllowance.lt(makerFillAmount)) {
            globalErrMsg = 'Maker does not have a high enough allowance set to complete this order';
        } else if (!isValidSignature) {
            globalErrMsg = 'Order signature is not valid';
        }
        if (globalErrMsg !== '') {
            this.setState({
                isFilling: false,
                globalErrMsg,
            });
            return;
        }

        const parsedOrderSalt = new BigNumber(parsedOrder.salt);
        const parsedMakerFee = new BigNumber(parsedOrder.maker.feeAmount);
        const parsedTakerFee = new BigNumber(parsedOrder.taker.feeAmount);
        try {
            const orderFilledAmount: BigNumber.BigNumber = await this.props.blockchain.fillOrderAsync(
                                                       parsedOrder.maker.address,
                                                       parsedOrder.taker.address,
                                                       this.props.tokenByAddress[makerTokenAddress].address,
                                                       this.props.tokenByAddress[takerTokenAddress].address,
                                                       depositAssetToken.amount,
                                                       receiveAssetToken.amount,
                                                       parsedMakerFee,
                                                       parsedTakerFee,
                                                       parsedOrderExpiration,
                                                       parsedOrder.feeRecipient,
                                                       this.props.orderFillAmount,
                                                       parsedOrder.signature,
                                                       parsedOrderSalt,
                                                   );
            // After fill completes, let's update the token balances
            const makerToken = this.props.tokenByAddress[makerTokenAddress];
            const tokens = [makerToken, takerToken];
            await this.props.blockchain.updateTokenBalancesAndAllowancesAsync(tokens);
            this.setState({
                isFilling: false,
                didFillOrderSucceed: true,
                globalErrMsg: '',
                unavailableTakerAmount: this.state.unavailableTakerAmount.plus(orderFilledAmount),
            });
            return;
        } catch (err) {
            this.setState({
                isFilling: false,
            });
            const errMsg = `${err}`;
            if (_.includes(errMsg, 'User denied transaction signature')) {
                return;
            }
            globalErrMsg = 'Failed to fill order, please refresh and try again';
            if (_.includes(errMsg, ExchangeContractErrs.OrderFillRoundingError)) {
                globalErrMsg = 'The rounding error was too large when filling this order';
            }
            utils.consoleLog(`${err}`);
            await errorReporter.reportAsync(err);
            this.setState({
                globalErrMsg,
            });
            return;
        }
    }
    private addTokenToCustomTokensIfUnseen(orderToken: OrderToken) {
        const existingToken = this.props.tokenByAddress[orderToken.address];

        // If a token with the address already exists, we trust the tokens retrieved from the
        // tokenRegistry or supplied by the current user over ones from an orderJSON. Thus, we
        // do not add a customToken and will defer to the rest of the details associated to the existing
        // token with this address for the rest of it's metadata.
        const doesTokenWithAddressExist = !_.isUndefined(existingToken);
        if (doesTokenWithAddressExist) {
            return;
        }

        // Let's make sure this token (with a unique address), also have a unique name/symbol, otherwise
        // we append something to make it visibly clear to the end user that this is a different underlying
        // token then the identically named one they already had locally.
        const existingTokens = _.values(this.props.tokenByAddress);
        const isUniqueName = _.isUndefined(_.find(existingTokens, {name: orderToken.name}));
        if (!isUniqueName) {
            orderToken.name = `${orderToken.name} [Imported]`;
        }

        const isUniqueSymbol = _.isUndefined(_.find(existingTokens, {symbol: orderToken.symbol}));
        if (!isUniqueSymbol) {
            orderToken.symbol = this.addSymbolFlourish(orderToken.symbol);
        }

        // Add default token icon url
        const token: Token = {
            ...orderToken,
            iconUrl: constants.DEFAULT_TOKEN_ICON_URL,
            balance: new BigNumber(0),
            allowance: new BigNumber(0),
        };

        // Add the custom token to local storage and to the redux store
        customTokenStorage.addCustomToken(this.props.blockchain.networkId, token);
        this.props.dispatcher.addTokenToTokenByAddress(token);

        // FireAndForget update balance & allowance
        this.props.blockchain.updateTokenBalancesAndAllowancesAsync([token]);
    }
    private addSymbolFlourish(symbol: string) {
        return `*${symbol}*`;
    }
    private formatCurrencyAmount(amount: BigNumber.BigNumber, decimals: number): number {
        const unitAmount = ZeroEx.toUnitAmount(amount, decimals);
        const roundedUnitAmount = Math.round(unitAmount.toNumber() * 100000) / 100000;
        return roundedUnitAmount;
    }
}
