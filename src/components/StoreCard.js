import React, {Component} from 'react';
import {Card, CardBody, CardImg, CardText, CardTitle, Table} from 'reactstrap';

/*
    This component offers the look of a storecard for the store view
 */
class StoreCard extends Component {

    constructor(props) {
        super(props);
        this.handleClick = this.handleClick.bind(this);
    }

    handleClick() {
        this.props.onClick(this.props.id);
    }

    render() {

        const isActive = this.props.id === this.props.activeId;

        let color = isActive ? "primary" : "";
        let textcolor = isActive ? "text-white" : "";

        return (
            <Card onClick={this.handleClick}
                  color={color}
                  className={textcolor}
                  style={{marginBottom: 15 + 'px'}}
                  id={this.props.id}>
                <CardImg onClick={this.handleClick} top width="100%" src={this.props.imgsrc} alt={this.props.imgalt}/>
                <CardBody onClick={this.handleClick}>
                    <CardTitle onClick={this.handleClick}>{this.props.title}</CardTitle>
                    <CardText onClick={this.handleClick}>
                        {this.props.text}
                        <Table>
                            <tbody>
                            <tr>
                                <th scope="row">CPU:</th>
                                <td>{this.props.details.cpu} vCPU</td>
                            </tr>
                            <tr>
                                <th scope="row">Memory:</th>
                                <td>{this.props.details.ram} GB</td>
                            </tr>
                            <tr>
                                <th scope="row">SSD:</th>
                                <td>{this.props.details.ssd} GB</td>
                            </tr>
                            <tr>
                                <th scope="row">Price:</th>
                                <td>{this.props.price} wei/day</td>
                            </tr>
                            </tbody>
                        </Table>
                    </CardText>
                </CardBody>
            </Card>
        )
    }
}

export default StoreCard;