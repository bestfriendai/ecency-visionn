import React, {Component} from "react";

import {PrivateKey} from "@esteemapp/dhive";

import {Modal, Form, Row, Col, InputGroup, FormControl, Button} from "react-bootstrap";

import {Account} from '../../store/accounts/types'
import {User} from "../../store/users/types";
import {ActiveUser} from "../../store/active-user/types";
import {Transactions} from "../../store/transactions/types";

import LinearProgress from "../linear-progress";
import UserAvatar from "../user-avatar";
import SuggestionList from "../suggestion-list";
import OrDivider from "../or-divider";
import {error} from "../feedback";

import amountFormatCheck from '../../helper/amount-format-check';
import parseAsset from "../../helper/parse-asset";
import formattedNumber from "../../util/formatted-number";

import {getAccount, getAccountFull} from "../../api/hive";

import {
    transfer,
    transferHot,
    transferToSavings,
    transferToSavingsHot,
    transferFromSavings,
    transferFromSavingsHot,
    transferToVesting,
    transferToVestingHot,
    convert,
    convertHot,
    formatError
} from "../../api/operations";

import {_t} from "../../i18n";

import badActors from '../../constants/bad-actors.json';

import {arrowRightSvg, keySvg} from "../../img/svg";

const hsLogo = require("../../img/hive-signer.svg");

export type TransferMode = 'transfer' | 'transfer-saving' | 'convert' | 'withdraw-saving' | 'power-up';
export type TransferAsset = 'HIVE' | 'HBD';


class AssetSwitch extends Component<{
    selected: TransferAsset;
    onChange: (i: TransferAsset) => void
}> {
    clicked = (i: TransferAsset) => {
        this.setState({selected: i});
        const {onChange} = this.props;
        onChange(i);
    };

    render() {
        const {selected} = this.props;

        return (
            <div className="asset-switch">
                <a onClick={() => this.clicked('HIVE')}
                   className={`asset ${selected === 'HIVE' ? 'selected' : ''}`}
                >HIVE</a>
                <a onClick={() => this.clicked('HBD')}
                   className={`asset ${selected === 'HBD' ? 'selected' : ''}`}
                >HBD</a>
            </div>
        );
    }
}

class FormText extends Component<{
    msg: string,
    type: "danger" | "warning" | "muted";
}> {
    render() {
        return <Row>
            <Col md={{span: 10, offset: 2}}>
                <Form.Text className={`text-${this.props.type} tr-form-text`}>{this.props.msg}</Form.Text>
            </Col>
        </Row>
    }
}


interface Props {
    mode: TransferMode,
    asset: TransferAsset,
    users: User[];
    activeUser: ActiveUser;
    transactions: Transactions;
    addAccount: (data: Account) => void;
    updateActiveUser: (data: Account) => void;
    onHide: () => void;
}

interface State {
    step: 1 | 2 | 3 | 4;
    asset: TransferAsset;
    to: string,
    toData: Account | null,
    toError: string,
    toWarning: string,
    amount: string,
    amountError: string;
    memo: string,
    privateKey: string;
    inProgress: boolean;
}

const pureState = (props: Props): State => {
    return {
        step: 1,
        asset: props.asset,
        to: '',
        toData: null,
        toError: '',
        toWarning: '',
        amount: '0.001',
        amountError: '',
        memo: '',
        privateKey: '',
        inProgress: false,
    }
}

export class TransferDialog extends Component<Props, State> {
    state: State = pureState(this.props);

    _timer: any = null;
    _mounted: boolean = true;

    componentDidMount() {
        const {mode, activeUser} = this.props;

        // auto fill
        if (mode !== 'transfer') {
            this.stateSet({to: activeUser.username, toData: activeUser.data});
        }

        if (mode === 'convert') {
            this.stateSet({asset: 'HBD'})
        }

        // initial balance check
        this.checkAmount();
    }

    componentWillUnmount() {
        this._mounted = false;
    }

    stateSet = (state: {}, cb?: () => void) => {
        if (this._mounted) {
            this.setState(state, cb);
        }
    };

    assetChanged = (asset: TransferAsset) => {
        this.stateSet({asset}, () => {
            this.checkAmount();
        });
    };

    toChanged = (e: React.ChangeEvent<FormControl & HTMLInputElement>) => {
        const {value: to} = e.target;
        this.stateSet({to}, this.handleTo);
    };

    toSelected = (to: string) => {
        this.stateSet({to}, this.handleTo);
    }

    amountChanged = (e: React.ChangeEvent<FormControl & HTMLInputElement>): void => {
        const {value: amount} = e.target;
        this.stateSet({amount}, () => {
            this.checkAmount();
        });
    };

    memoChanged = (e: React.ChangeEvent<FormControl & HTMLInputElement>): void => {
        const {value: memo} = e.target;
        this.setState({memo});
    };

    handleTo = () => {
        const {to} = this.state;

        if (this._timer) {
            clearTimeout(this._timer);
        }

        if (to === '') {
            this.stateSet({toWarning: '', toError: '', toData: null});
            return;
        }

        this._timer = setTimeout(() => {
            if (badActors.includes(to)) {
                this.stateSet({toWarning: _t("transfer.to-bad-actor")});
            } else {
                this.stateSet({toWarning: ''});
            }

            this.stateSet({inProgress: true, toData: null});

            return getAccount(to)
                .then(resp => {
                    if (resp) {
                        this.stateSet({toError: '', toData: resp});
                    } else {
                        this.stateSet({
                            toError: _t("transfer.to-not-found")
                        });
                    }

                    return resp;
                })
                .catch(err => {
                    error(formatError(err));
                })
                .finally(() => {
                    this.stateSet({inProgress: false});
                });
        }, 500);
    }

    checkAmount = () => {
        const {amount} = this.state;

        if (amount === '') {
            this.stateSet({amountError: ''});
            return;
        }

        if (!amountFormatCheck(amount)) {
            this.stateSet({amountError: _t("transfer.wrong-amount")});
            return;
        }

        const dotParts = amount.split('.');
        if (dotParts.length > 1) {
            const precision = dotParts[1];
            if (precision.length > 3) {
                this.stateSet({amountError: _t("transfer.amount-precision-error")});
                return;
            }
        }

        if (parseFloat(amount) > this.getBalance()) {
            this.stateSet({amountError: _t("transfer.insufficient-funds")});
            return;
        }

        this.stateSet({amountError: ''});
    };

    copyBalance = () => {
        const balance = this.getBalance();
        this.stateSet({amount: formattedNumber(balance, {fractionDigits: 3})}, () => {
            this.checkAmount();
        });
    };

    getBalance = (): number => {
        const {mode, activeUser} = this.props;
        const {asset} = this.state;

        const {data: account} = activeUser;

        if (mode === 'withdraw-saving') {
            const k = asset === 'HIVE' ? 'savings_balance' : 'savings_sbd_balance';
            return parseAsset(account[k]).amount;
        }

        const k = asset === 'HIVE' ? 'balance' : 'sbd_balance';
        return parseAsset(account[k]).amount;
    };

    canSubmit = () => {
        const {toData, toError, amountError, inProgress, amount} = this.state;
        return toData && !toError && !amountError && !inProgress && parseFloat(amount) > 0;
    };

    next = () => {
        // make sure 3 decimals in amount
        const {amount} = this.state;
        const fixedAmount = formattedNumber(amount, {fractionDigits: 3});

        this.setState({step: 2, amount: fixedAmount});
    };

    back = () => {
        this.setState({step: 1});
    };

    confirm = () => {
        this.setState({step: 3});
    }

    privateKeyChanged = (e: React.ChangeEvent<FormControl & HTMLInputElement>): void => {
        const {value: privateKey} = e.target;
        this.stateSet({privateKey});
    }

    sign = () => {
        const {privateKey} = this.state;
        let key: PrivateKey;

        try {
            key = PrivateKey.fromString(privateKey);
        } catch (e) {
            error('Invalid private key!');
            return;
        }

        const {users, activeUser, mode} = this.props;
        const {to, amount, asset, memo} = this.state;
        const fullAmount = `${amount} ${asset}`;
        const user = users.find((x) => x.username === activeUser?.username)!;

        let prms: Promise<any>;
        switch (mode) {
            case 'transfer':
                prms = transfer(user, key, to, fullAmount, memo)
                break;
            case 'transfer-saving':
                prms = transferToSavings(user, key, to, fullAmount, memo);
                break;
            case 'convert':
                prms = convert(user, key, amount)
                break;
            case 'withdraw-saving':
                prms = transferFromSavings(user, key, to, fullAmount, memo);
                break;
            case 'power-up':
                prms = transferToVesting(user, key, to, fullAmount);
                break;
            default:
                return;
        }

        this.stateSet({inProgress: true});
        prms.then(() => getAccountFull(activeUser.username))
            .then((a) => {
                const {addAccount, updateActiveUser} = this.props;
                addAccount(a);
                updateActiveUser(a);
                this.stateSet({step: 4, inProgress: false});
            }).catch(err => {
            error(formatError(err));
            this.stateSet({inProgress: false});
        })
    }

    signHs = () => {
        const {users, activeUser, mode, onHide} = this.props;
        const {to, amount, asset, memo} = this.state;
        const fullAmount = `${amount} ${asset}`;
        const user = users.find((x) => x.username === activeUser?.username)!;

        let prms: Promise<any>;
        switch (mode) {
            case 'transfer':
                prms = transferHot(user, to, fullAmount, memo)
                break;
            case 'transfer-saving':
                prms = transferToSavingsHot(user, to, fullAmount, memo);
                break;
            case 'convert':
                prms = convertHot(user, amount)
                break;
            case 'withdraw-saving':
                prms = transferFromSavingsHot(user, to, fullAmount, memo);
                break;
            case 'power-up':
                prms = transferToVestingHot(user, to, fullAmount);
                break;
            default:
                return;
        }

        onHide();
    }

    finish = () => {
        const {onHide} = this.props;
        onHide();
    }

    reset = () => {
        this.stateSet(pureState(this.props));
    }

    render() {
        const {mode, activeUser, transactions} = this.props;
        const {step, asset, to, toError, toWarning, amount, amountError, memo, privateKey, inProgress} = this.state;

        const recent = [...new Set(
            transactions.list
                .filter(x => x.type === 'transfer' && x.from === activeUser.username)
                .map(x => x.type === 'transfer' ? x.to : '')
                .filter(x => {
                    if (to.trim() === '') {
                        return true;
                    }

                    return x.indexOf(to) !== -1;
                })
                .reverse()
                .slice(0, 5)
        )]

        const suggestionProps = {
            header: _t('transfer.recent-transfers'),
            renderer: (i: string) => {
                return <><UserAvatar username={i} size="small"/> <span style={{marginLeft: '4px'}}>{i}</span></>;
            },
            onSelect: this.toSelected,
        };

        return <div className="transfer-dialog-content">
            {step === 1 && (
                <div className={`transfer-box ${inProgress ? 'in-progress' : ''}`}>
                    <div className="transfer-box-header">
                        <div className="step-no">1</div>
                        <div className="box-titles">
                            <div className="main-title">
                                {mode === 'transfer' && _t('transfer.transfer-title')}
                                {mode === 'transfer-saving' && _t('transfer.transfer-saving-title')}
                                {mode === 'withdraw-saving' && _t('transfer.withdraw-saving-title')}
                                {mode === 'power-up' && _t('transfer.power-up-title')}
                                {mode === 'convert' && _t('transfer.convert-title')}
                            </div>
                            <div className="sub-title">
                                {mode === 'transfer' && _t('transfer.transfer-sub-title')}
                                {mode === 'transfer-saving' && _t('transfer.transfer-saving-sub-title')}
                                {mode === 'withdraw-saving' && _t('transfer.withdraw-saving-sub-title')}
                                {mode === 'power-up' && _t('transfer.power-up-sub-title')}
                                {mode === 'convert' && _t('transfer.convert-sub-title')}
                            </div>
                        </div>
                    </div>
                    {inProgress && <LinearProgress/>}
                    <Form className="transfer-box-body">
                        <div className="transfer-form">
                            <Form.Group as={Row}>
                                <Form.Label column={true} sm="2">
                                    {_t("transfer.from")}
                                </Form.Label>
                                <Col sm="10">
                                    <InputGroup>
                                        <InputGroup.Prepend>
                                            <InputGroup.Text>@</InputGroup.Text>
                                        </InputGroup.Prepend>
                                        <Form.Control value={activeUser.username} readOnly={true}/>
                                    </InputGroup>
                                </Col>
                            </Form.Group>

                            {['transfer', 'transfer-saving', 'withdraw-saving', 'power-up'].includes(mode) && (
                                <>
                                    <Form.Group as={Row}>
                                        <Form.Label column={true} sm="2">
                                            {_t("transfer.to")}
                                        </Form.Label>
                                        <Col sm="10">
                                            <SuggestionList items={recent} {...suggestionProps}>
                                                <InputGroup>
                                                    <InputGroup.Prepend>
                                                        <InputGroup.Text>@</InputGroup.Text>
                                                    </InputGroup.Prepend>
                                                    <Form.Control
                                                        type="text"
                                                        autoFocus={to === ''}
                                                        placeholder={_t("transfer.to-placeholder")}
                                                        value={to}
                                                        onChange={this.toChanged}
                                                        className={toError ? "is-invalid" : ""}
                                                    />
                                                </InputGroup>
                                            </SuggestionList>
                                        </Col>
                                    </Form.Group>
                                    {toWarning && (
                                        <FormText msg={toWarning} type="danger"/>
                                    )}
                                    {toError && (
                                        <FormText msg={toError} type="danger"/>
                                    )}
                                </>
                            )}

                            <Form.Group as={Row}>
                                <Form.Label column={true} sm="2">
                                    {_t("transfer.amount")}
                                </Form.Label>
                                <Col sm="10" className="d-flex align-items-center">
                                    <InputGroup>
                                        <InputGroup.Prepend>
                                            <InputGroup.Text>@</InputGroup.Text>
                                        </InputGroup.Prepend>
                                        <Form.Control
                                            type="text"
                                            placeholder={_t("transfer.amount-placeholder")}
                                            value={amount}
                                            onChange={this.amountChanged}
                                            className={amountError ? "is-invalid" : ""}
                                            autoFocus={(mode !== 'transfer')}
                                        />
                                    </InputGroup>
                                    {mode !== 'power-up' && (
                                        <AssetSwitch
                                            selected={asset}
                                            onChange={this.assetChanged}
                                        />
                                    )}
                                </Col>
                            </Form.Group>
                            {amountError && (<FormText msg={amountError} type="danger"/>)}
                            <Row>
                                <Col md={{span: 10, offset: 2}}>
                                    <div className="balance">
                                        {_t("transfer.balance")}{": "}
                                        <span onClick={this.copyBalance} className="balance-num">{formattedNumber(this.getBalance(), {fractionDigits: 3})} {asset}</span>
                                    </div>
                                </Col>
                            </Row>

                            {['transfer', 'transfer-saving', 'withdraw-saving'].includes(mode) && (
                                <>
                                    <Form.Group as={Row}>
                                        <Form.Label column={true} sm="2">
                                            {_t("transfer.memo")}
                                        </Form.Label>
                                        <Col sm="10">
                                            <Form.Control
                                                placeholder={_t("transfer.memo-placeholder")}
                                                value={memo}
                                                onChange={this.memoChanged}
                                            />
                                        </Col>
                                    </Form.Group>
                                    <FormText msg={_t("transfer.memo-help")} type="muted"/>
                                </>
                            )}

                            <Form.Group as={Row}>
                                <Col sm={{span: 10, offset: 2}}>
                                    <Button onClick={this.next} disabled={!this.canSubmit()}>{_t('transfer.next')}</Button>
                                </Col>
                            </Form.Group>
                        </div>
                    </Form>
                </div>
            )}

            {step === 2 && (
                <div className="transfer-box">
                    <div className="transfer-box-header">
                        <div className="step-no">2</div>
                        <div className="box-titles">
                            <div className="main-title">
                                {_t('transfer.confirm-title')}
                            </div>
                            <div className="sub-title">
                                {_t('transfer.confirm-sub-title')}
                            </div>
                        </div>
                    </div>
                    <div className="transfer-box-body">
                        <div className="confirmation">
                            <div className="users">
                                <div className="from-user">
                                    <UserAvatar
                                        {...this.props}
                                        username={activeUser.username}
                                        size="xLarge"
                                    />
                                </div>
                                <div className="arrow">{arrowRightSvg}</div>
                                <div className="to-user">
                                    <UserAvatar {...this.props} username={to} size="xLarge"/>
                                </div>
                            </div>
                            <div className="amount">
                                {amount} {asset}
                            </div>
                            {memo && <div className="memo">{memo}</div>}
                        </div>
                        <div className="d-flex justify-content-center">
                            <Button variant="outline-secondary" disabled={inProgress} onClick={this.back}>
                                {_t("transfer.back")}
                            </Button>
                            <span className="hr-6px-btn-spacer"/>
                            <Button disabled={inProgress} onClick={this.confirm}>
                                {inProgress && (
                                    <span>spinner</span>
                                )}
                                {_t("transfer.confirm")}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {step === 3 && (
                <div className="transfer-box">
                    <div className="transfer-box-header">
                        <div className="step-no">3</div>
                        <div className="box-titles">
                            <div className="main-title">
                                {_t('transfer.sign-title')}
                            </div>
                            <div className="sub-title">
                                {_t('transfer.sign-sub-title')}
                            </div>
                        </div>
                    </div>
                    <div className="transfer-box-body">
                        <div className="sign-tr">
                            <InputGroup>
                                <InputGroup.Prepend>
                                    <InputGroup.Text>{keySvg}</InputGroup.Text>
                                </InputGroup.Prepend>
                                <Form.Control
                                    value={privateKey}
                                    type="password"
                                    autoFocus={true}
                                    placeholder={_t('transfer.private-key-placeholder')}
                                    onChange={this.privateKeyChanged}/>
                                <InputGroup.Append>
                                    <Button disabled={inProgress} onClick={this.sign}>{_t("transfer.sign")}</Button>
                                </InputGroup.Append>
                            </InputGroup>
                            <OrDivider/>
                            <div className="hs-sign">
                                <Button variant="outline-primary" onClick={this.signHs}>
                                    <img src={hsLogo} className="hs-logo" alt="hivesigner"/> {_t("transfer.with-hivesigner")}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {step === 4 && (
                <div className="transfer-box">
                    <div className="transfer-box-header">
                        <div className="step-no">4</div>
                        <div className="box-titles">
                            <div className="main-title">
                                {_t('transfer.success-title')}
                            </div>
                            <div className="sub-title">
                                {_t('transfer.success-sub-title')}
                            </div>
                        </div>
                    </div>
                    <div className="transfer-box-body">
                        <div className="success"
                             dangerouslySetInnerHTML={{__html: _t("transfer.transfer-summary", {amount: `${amount} ${asset}`, from: activeUser.username, to})}}/>
                        <div className="d-flex justify-content-center">
                            <Button variant="outline-secondary" onClick={this.reset}>
                                {_t("transfer.reset")}
                            </Button>
                            <span className="hr-6px-btn-spacer"/>
                            <Button onClick={this.finish}>
                                {_t("transfer.finish")}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    }
}

export default class Transfer extends Component<Props> {
    render() {
        const {onHide} = this.props;
        return (
            <Modal animation={false} show={true} centered={true} onHide={onHide} keyboard={false} className="transfer-dialog" size="lg">
                <Modal.Header closeButton={true}/>
                <Modal.Body>
                    <TransferDialog {...this.props} />
                </Modal.Body>
            </Modal>
        );
    }
}
